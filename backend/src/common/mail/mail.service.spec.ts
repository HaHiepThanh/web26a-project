import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer');

const cfg = (o: Record<string, string | undefined>) =>
  ({ get: (k: string) => o[k] }) as unknown as ConfigService;

/** Giả lập phản hồi HTTP của Brevo. */
function brevoTraLoi(status: number, than = '') {
  const f = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => than,
  });
  (global as unknown as { fetch: unknown }).fetch = f;
  return f;
}

/** Giả lập Brevo không với tới được (hết giờ, mất mạng). */
function brevoNem(err: Error) {
  (global as unknown as { fetch: unknown }).fetch = jest.fn().mockRejectedValue(err);
}

/** Gắn một transporter giả cho nhánh SMTP. */
function smtpGui(impl: () => Promise<unknown>) {
  const sendMail = jest.fn(impl);
  (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  return sendMail;
}

const KHOA = { BREVO_API_KEY: 'khoa-brevo', MAIL_FROM_EMAIL: 'toi@gmail.com' };

describe('MailService — chọn đường gửi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('có BREVO_API_KEY thì dùng Brevo, KHÔNG mở SMTP', () => {
    // Railway (Free/Trial/Hobby) chặn cứng cổng 25/465/587, nên có Brevo là
    // phải ưu tiên nó — kể cả khi SMTP cũng đã khai đầy đủ.
    const m = new MailService(
      cfg({ ...KHOA, SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x' }),
    );
    expect(m.daCauHinh).toBe(true);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('BREVO_API_KEY để TRỐNG thì rơi về SMTP', () => {
    // `.env` mẫu để sẵn dòng trống cho người dùng điền. `ConfigService.get()`
    // trả `''` chứ không phải `undefined`, nên `??` không rơi sang vế sau —
    // đúng cái bẫy đã làm hỏng phần kiểm duyệt ảnh trước đây.
    smtpGui(async () => ({}));
    const m = new MailService(
      cfg({ BREVO_API_KEY: '', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x' }),
    );
    expect(m.daCauHinh).toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalled();
  });

  it('không khai gì thì daCauHinh = false và không gửi', async () => {
    const m = new MailService(cfg({}));
    expect(m.daCauHinh).toBe(false);
    expect(await m.sendPasswordResetEmail('ai@do.com', 'https://x/y')).toBe(false);
  });

  it('SMTP ép IPv4 và siết thời gian chờ', () => {
    // Nodemailer mặc định chờ 2 PHÚT cho mỗi địa chỉ IP, mà smtp.gmail.com có
    // cả A lẫn AAAA — người dùng ngồi nhìn vòng xoay tới 4 phút.
    smtpGui(async () => ({}));
    new MailService(cfg({ SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x' }));
    const opts = (nodemailer.createTransport as jest.Mock).mock.calls[0][0];
    expect(opts.family).toBe(4);
    expect(opts.connectionTimeout).toBeLessThanOrEqual(15_000);
    expect(opts.greetingTimeout).toBeLessThanOrEqual(15_000);
  });
});

describe('MailService — gửi qua Brevo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gửi thành công', async () => {
    const f = brevoTraLoi(201);
    const m = new MailService(cfg(KHOA));
    expect(await m.sendPasswordResetEmail('hv@gmail.com', 'https://x/y')).toBe(true);

    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('khoa-brevo');
    const than = JSON.parse(init.body);
    expect(than.sender.email).toBe('toi@gmail.com');
    expect(than.to).toEqual([{ email: 'hv@gmail.com' }]);
    expect(than.htmlContent).toContain('https://x/y');
  });

  it('người gửi rơi về SMTP_USER khi chưa khai MAIL_FROM_EMAIL', async () => {
    const f = brevoTraLoi(201);
    const m = new MailService(
      cfg({ BREVO_API_KEY: 'k', SMTP_USER: 'cu@gmail.com' }),
    );
    await m.sendPasswordResetEmail('hv@gmail.com', 'https://x/y');
    expect(JSON.parse(f.mock.calls[0][1].body).sender.email).toBe('cu@gmail.com');
  });

  it('có đặt trần thời gian chờ', async () => {
    const f = brevoTraLoi(201);
    const m = new MailService(cfg(KHOA));
    await m.sendPasswordResetEmail('hv@gmail.com', 'https://x/y');
    expect(f.mock.calls[0][1].signal).toBeDefined();
  });
});

describe('MailService — cầu dao khi đường gửi hỏng', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('khoá sai (401) hạ cầu dao → daCauHinh thành false', async () => {
    // Đây là điểm mấu chốt: frontend đọc `mailConfigured` để quyết định có quay
    // về đường gửi mail của Firebase hay không. Bản cũ chỉ hỏi "đã điền thông
    // tin đăng nhập chưa" nên luôn nói `true`, đường lui không bao giờ chạy, và
    // học viên nhận thông báo xanh với hộp thư trống.
    brevoTraLoi(401, 'unauthorized');
    const m = new MailService(cfg(KHOA));
    expect(m.daCauHinh).toBe(true);
    expect(await m.sendPasswordResetEmail('hv@gmail.com', 'https://x/y')).toBe(false);
    expect(m.daCauHinh).toBe(false);
  });

  it('hết hạn mức (429) và lỗi nhà cung cấp (5xx) cũng hạ cầu dao', async () => {
    for (const status of [429, 500, 503]) {
      brevoTraLoi(status);
      const m = new MailService(cfg(KHOA));
      await m.sendPasswordResetEmail('hv@gmail.com', 'https://x/y');
      expect(m.daCauHinh).toBe(false);
    }
  });

  it('không với tới được Brevo (hết giờ) hạ cầu dao', async () => {
    brevoNem(Object.assign(new Error('The operation was aborted'), {
      name: 'TimeoutError',
    }));
    const m = new MailService(cfg(KHOA));
    await m.sendPasswordResetEmail('hv@gmail.com', 'https://x/y');
    expect(m.daCauHinh).toBe(false);
  });

  it('400 là chuyện riêng của THƯ ĐÓ — KHÔNG hạ cầu dao', async () => {
    // Địa chỉ nhận không hợp lệ thì chỉ thư đó hỏng. Chặn cả hệ vì một địa chỉ
    // rác là tự đẩy mọi người sang đường lui một cách vô cớ.
    brevoTraLoi(400, 'invalid recipient');
    const m = new MailService(cfg(KHOA));
    expect(await m.sendPasswordResetEmail('rac@@', 'https://x/y')).toBe(false);
    expect(m.daCauHinh).toBe(true);
  });

  it('SMTP ETIMEDOUT hạ cầu dao — đúng lỗi đã gặp trên production', async () => {
    smtpGui(async () => {
      throw Object.assign(new Error('Connection timeout'), {
        code: 'ETIMEDOUT',
        command: 'CONN',
      });
    });
    const m = new MailService(cfg({ SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x' }));
    expect(await m.sendPasswordResetEmail('hv@gmail.com', 'https://x/y')).toBe(false);
    expect(m.daCauHinh).toBe(false);
  });

  it('cầu dao TỰ ĐÓNG LẠI sau thời gian nghỉ', async () => {
    // Không tự phục hồi thì một sự cố thoáng qua làm tắt email vĩnh viễn cho
    // tới lần khởi động lại kế tiếp.
    brevoTraLoi(500);
    const m = new MailService(cfg(KHOA));
    const t0 = Date.now();
    await m.sendPasswordResetEmail('hv@gmail.com', 'https://x/y');
    expect(m.daCauHinh).toBe(false);

    jest.spyOn(Date, 'now').mockReturnValue(t0 + 6 * 60_000);
    expect(m.daCauHinh).toBe(true);
  });

  it('gửi lại được thì cầu dao đóng ngay', async () => {
    brevoTraLoi(500);
    const m = new MailService(cfg(KHOA));
    await m.sendPasswordResetEmail('hv@gmail.com', 'https://x/y');
    expect(m.daCauHinh).toBe(false);

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60_000);
    brevoTraLoi(201);
    expect(await m.sendPasswordResetEmail('hv@gmail.com', 'https://x/y')).toBe(true);
    jest.restoreAllMocks();
    expect(m.daCauHinh).toBe(true);
  });
});
