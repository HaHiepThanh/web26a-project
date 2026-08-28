import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { docCauHinh } from '../moderation/cau-hinh.util';

/** API gửi mail của Brevo — chạy trên cổng 443 nên hạ tầng không chặn. */
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Trần thời gian cho MỘT lần gửi.
 *
 * Mặc định của nodemailer là 2 phút cho mỗi địa chỉ IP, mà `smtp.gmail.com`
 * phân giải ra cả IPv4 lẫn IPv6 — tức tối đa 4 phút. Vì `handleForgotPassword`
 * chờ gửi xong mới trả lời HTTP, người dùng ngồi nhìn vòng xoay suốt 4 phút đó
 * rồi mới nhận được thông báo (thành công giả).
 */
const HET_GIO_MS = 15_000;
const HET_GIO_KET_NOI_MS = 10_000;

/** Đường gửi gãy thì nghỉ bấy lâu rồi mới thử lại. */
const NGHI_SAU_KHI_GAY_MS = 5 * 60_000;

type Duong = 'brevo' | 'smtp';

/**
 * Hỏng ở tầng VẬN CHUYỂN — không kết nối được nhà cung cấp, hết hạn mức, nhà
 * cung cấp lỗi 5xx. Khác hẳn với "thư này có vấn đề" (địa chỉ sai chẳng hạn):
 * loại trên nghĩa là MỌI thư sau đó cũng sẽ hỏng, loại dưới thì không.
 */
class LoiVanChuyen extends Error {}

/** Mã lỗi nodemailer thuộc tầng vận chuyển. */
const MA_VAN_CHUYEN = new Set([
  'ETIMEDOUT',
  'ECONNECTION',
  'ESOCKET',
  'EDNS',
  'EAUTH',
  'ENETUNREACH',
  'ECONNREFUSED',
]);

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private brevoKey: string | null = null;
  private readonly duong: Duong | null = null;

  /** Lúc đường gửi bị đánh dấu hỏng; null = đang lành. */
  private gayLuc: number | null = null;

  constructor(private readonly config: ConfigService) {
    this.duong = this.chonDuong();
  }

  /**
   * Ưu tiên Brevo hơn SMTP.
   *
   * Không phải vì Brevo tốt hơn, mà vì nhiều nền tảng lưu trữ (Railway ở gói
   * Free/Trial/Hobby là một) chặn cứng cổng 25/465/587 để chống spam. Cùng một
   * bộ thông tin đăng nhập chạy ngon ở máy lập trình rồi chết câm khi lên máy
   * chủ. Brevo đi bằng HTTPS nên không dính.
   */
  private chonDuong(): Duong | null {
    const khoa = docCauHinh(this.config, 'BREVO_API_KEY');
    if (khoa) {
      this.brevoKey = khoa;
      this.logger.log(
        `MailService dùng Brevo HTTPS API (người gửi: ${this.diaChiGui()})`,
      );
      return 'brevo';
    }

    const user = docCauHinh(this.config, 'SMTP_USER');
    const pass = docCauHinh(this.config, 'SMTP_PASS');
    if (!user || !pass) {
      this.logger.warn(
        'Chưa cấu hình BREVO_API_KEY lẫn SMTP_USER/SMTP_PASS. Email sẽ chỉ được log ra console.',
      );
      return null;
    }

    const host = docCauHinh(this.config, 'SMTP_HOST') ?? 'smtp.gmail.com';
    const port = Number(docCauHinh(this.config, 'SMTP_PORT') ?? 465);
    // `family` có thật ở nodemailer (nó chuyển thẳng cho `net.connect`) nhưng
    // @types/nodemailer chưa khai, nên phải nới kiểu ra một chút.
    const tuyChon: SMTPTransport.Options & { family?: number } = {
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      // Ép IPv4: chặng IPv6 gần như luôn vô ích (nhiều máy chủ không có tuyến
      // IPv6 ra ngoài) mà vẫn ngốn trọn một lượt chờ hết giờ.
      family: 4,
      connectionTimeout: HET_GIO_KET_NOI_MS,
      greetingTimeout: HET_GIO_KET_NOI_MS,
      socketTimeout: HET_GIO_MS,
    };
    this.transporter = nodemailer.createTransport(tuyChon);
    this.logger.log(
      `MailService đã khởi tạo SMTP transporter (${host}:${port}, user: ${user})`,
    );
    return 'smtp';
  }

  private diaChiGui(): string {
    return (
      docCauHinh(this.config, 'MAIL_FROM_EMAIL', 'SMTP_USER') ??
      'noreply@horizon-hub-harmony.com'
    );
  }

  private tenGui(): string {
    return docCauHinh(this.config, 'MAIL_FROM_NAME') ?? 'Horizon Hub Harmony';
  }

  /**
   * Server có gửi email thật được không.
   *
   * ⚠️ Cố ý KHÔNG phải là "email này đã gửi thành công chưa". Cờ đó sẽ rò rỉ
   *    việc một địa chỉ có tồn tại hay không (gửi hụt = không có tài khoản),
   *    đúng thứ mà thông điệp chung chung ở `handleForgotPassword` đang tránh.
   *    Đây là sức khoẻ của MÁY CHỦ, chung cho mọi người dùng, nên an toàn.
   *
   * Bản trước chỉ hỏi "đã điền thông tin đăng nhập chưa" nên luôn trả `true` kể
   * cả khi cổng ra bị chặn. Frontend tin lời đó, bỏ qua đường lui Firebase, và
   * học viên nhận được thông báo xanh mà hộp thư trống.
   */
  get daCauHinh(): boolean {
    if (!this.duong) return false;
    if (this.gayLuc === null) return true;
    if (Date.now() - this.gayLuc < NGHI_SAU_KHI_GAY_MS) return false;
    this.gayLuc = null; // hết giờ nghỉ, cho thử lại
    return true;
  }

  async sendPasswordResetEmail(
    toEmail: string,
    resetUrl: string,
  ): Promise<boolean> {
    const subject = '[Horizon Hub Harmony] Reset your password';
    const html = this.dungHtml(toEmail, resetUrl);

    if (!this.duong) {
      // KHÔNG trả `true`: bản trước báo thành công dù chưa gửi gì, nên phía gọi
      // tưởng email đã đi và người dùng ngồi chờ một lá thư không tồn tại.
      this.logger.warn(
        `CHƯA CẤU HÌNH ĐƯỜNG GỬI MAIL — không gửi được email. Link reset cho ${toEmail}: ${resetUrl}`,
      );
      return false;
    }

    try {
      if (this.duong === 'brevo') {
        await this.guiQuaBrevo(toEmail, subject, html);
      } else {
        await this.guiQuaSmtp(toEmail, subject, html);
      }
      this.gayLuc = null;
      this.logger.log(`Đã gửi email reset password thành công tới ${toEmail}`);
      return true;
    } catch (err) {
      if (err instanceof LoiVanChuyen) {
        this.gayLuc = Date.now();
        this.logger.error(
          `ĐƯỜNG GỬI MAIL (${this.duong}) ĐANG HỎNG — tạm nghỉ ${NGHI_SAU_KHI_GAY_MS / 60_000} phút, ` +
            `app sẽ quay về đường gửi mail của Firebase: ${err.message}`,
        );
      } else {
        this.logger.error(`Gửi mail thất bại tới ${toEmail}:`, err);
      }
      return false;
    }
  }

  private async guiQuaBrevo(
    toEmail: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(BREVO_URL, {
        method: 'POST',
        headers: {
          'api-key': this.brevoKey as string,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: this.tenGui(), email: this.diaChiGui() },
          to: [{ email: toEmail }],
          subject,
          htmlContent,
        }),
        signal: AbortSignal.timeout(HET_GIO_MS),
      });
    } catch (err) {
      // Không với tới được Brevo: mất mạng, DNS hỏng, hoặc hết giờ.
      throw new LoiVanChuyen(`không gọi được Brevo: ${(err as Error).message}`);
    }

    if (res.ok) return;

    const than = await res.text().catch(() => '');
    // 401/403 = khoá sai, 429 = hết hạn mức, 5xx = Brevo hỏng. Cả ba đều làm
    // MỌI thư sau đó hỏng theo, nên phải hạ cầu dao. Còn 400 thường là chuyện
    // riêng của thư này (địa chỉ không hợp lệ) — đừng vì nó mà chặn cả hệ.
    if (res.status === 400) {
      throw new Error(`Brevo từ chối thư (400): ${than.slice(0, 300)}`);
    }
    throw new LoiVanChuyen(`Brevo trả ${res.status}: ${than.slice(0, 300)}`);
  }

  private async guiQuaSmtp(
    toEmail: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const from = `"${this.tenGui()}" <${this.diaChiGui()}>`;
    try {
      await (this.transporter as nodemailer.Transporter).sendMail({
        from,
        to: toEmail,
        subject,
        html,
      });
    } catch (err) {
      const ma = (err as { code?: string }).code ?? '';
      if (MA_VAN_CHUYEN.has(ma)) {
        throw new LoiVanChuyen(`SMTP ${ma}: ${(err as Error).message}`);
      }
      throw err;
    }
  }

  private dungHtml(toEmail: string, resetUrl: string): string {
    return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; letter-spacing: -0.02em;">Horizon Hub Harmony</h1>
    <p style="font-size: 13px; color: #64748b; margin: 0;">Smart Project Management &amp; Collaboration Workspace</p>
  </div>

  <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-bottom: 20px;">
    <h2 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0;">Password Reset Request</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
      Hello, we received a request to reset the password for your account associated with <strong>${toEmail}</strong>.
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
      Click the button below to set up a new password for your account:
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25);">
        Reset Password &rarr;
      </a>
    </div>

    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin: 24px 0;">
      <p style="font-size: 13px; line-height: 1.5; color: #92400e; margin: 0; font-weight: 600;">
        ⏱️ Security Notice: For your safety, this password reset link will expire in <strong>1 hour</strong>.
      </p>
    </div>

    <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 20px 0 0 0;">
      If you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.
    </p>
  </div>

  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
      &copy; 2026 Horizon Hub Harmony. All rights reserved.
    </p>
  </div>
</div>`;
  }
}
