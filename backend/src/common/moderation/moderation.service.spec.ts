import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModerationService } from './moderation.service';
import { MucDo, NhaCungCapKiemDuyet, NhomViPham } from './moderation.types';
import { VisionProvider } from './vision.provider';
import { GeminiVisionProvider } from './gemini-vision.provider';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 0x41),
]);
const GIF = Buffer.concat([
  Buffer.from('GIF89a', 'ascii'),
  Buffer.alloc(64, 0x41),
]);
const PDF = Buffer.from('%PDF-1.7\n%aaaaaaaaaaaaaaaa', 'ascii');

/** Ảnh PNG khác nhau về nội dung → hash khác nhau (để thử bộ nhớ hash). */
const pngKhac = (n: number) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, n),
  ]);

function nhaCungCap(
  ten: string,
  ket: Partial<Record<NhomViPham, MucDo>> | Error,
): NhaCungCapKiemDuyet & { soLanGoi: number } {
  return {
    ten,
    bat: true,
    soLanGoi: 0,
    async cham(this: { soLanGoi: number }) {
      this.soLanGoi++;
      if (ket instanceof Error) throw ket;
      return ket;
    },
  };
}

/** Dựng service với danh sách nhà cung cấp tuỳ ý (bỏ qua DI thật). */
function dungService(
  ds: NhaCungCapKiemDuyet[],
  bat = 'true',
): ModerationService {
  const config = {
    get: (k: string) => (k === 'MODERATION_ENABLED' ? bat : undefined),
  };
  const svc = new ModerationService(
    config as unknown as ConfigService,
    { ten: 'vision', bat: false } as unknown as VisionProvider,
    { ten: 'gemini', bat: false } as unknown as GeminiVisionProvider,
  );
  // Ghi đè danh sách đã lọc trong constructor.
  (svc as unknown as { nhaCungCap: NhaCungCapKiemDuyet[] }).nhaCungCap = ds;
  return svc;
}

describe('ModerationService', () => {
  describe('cửa vào: định dạng', () => {
    it('từ chối file không phải ảnh', async () => {
      const svc = dungService([nhaCungCap('a', {})]);
      await expect(svc.kiemTra(PDF, 'test')).rejects.toThrow(
        BadRequestException,
      );
      await expect(svc.kiemTra(PDF, 'test')).rejects.toThrow(/not a valid/i);
    });

    it('từ chối GIF — API kiểm duyệt chỉ quét MỘT khung hình', async () => {
      // Ảnh động sạch ở khung đầu, vi phạm ở khung 30 thì lọt trót lọt.
      const svc = dungService([nhaCungCap('a', {})]);
      await expect(svc.kiemTra(GIF, 'test')).rejects.toThrow(/Animated GIFs/i);
    });

    it('ảnh quá lớn thì từ chối kèm lý do rõ, không để request lỗi khó hiểu', async () => {
      // Cả hai nhà cung cấp đều nhận ảnh dạng base64 nhúng trong thân request,
      // mà base64 phình ~33%.
      const p = nhaCungCap('a', {});
      const svc = dungService([p]);
      const to = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(9 * 1024 * 1024, 0x41),
      ]);
      await expect(svc.kiemTra(to, 'test')).rejects.toThrow(
        /cannot be content-checked/i,
      );
      expect(p.soLanGoi).toBe(0);
    });

    it('trả về mime/đuôi suy từ NỘI DUNG, không từ chuỗi client khai', async () => {
      const svc = dungService([nhaCungCap('a', {})]);
      const kq = await svc.kiemTra(PNG, 'test');
      expect(kq.mime).toBe('image/png');
      expect(kq.duoi).toBe('.png');
    });
  });

  describe('ngưỡng chặn', () => {
    it('mức 0 và 1 được cho qua', async () => {
      const svc = dungService([nhaCungCap('a', { khieu_dam: 1, bao_luc: 1 })]);
      await expect(svc.kiemTra(PNG, 'test')).resolves.toBeTruthy();
    });

    it('mức 2 trở lên bị chặn', async () => {
      const svc = dungService([nhaCungCap('a', { khieu_dam: 2 })]);
      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow(/sexual content/i);
    });

    it('câu báo lỗi nêu đúng nhóm vi phạm, không lộ tên kỹ thuật', async () => {
      const svc = dungService([nhaCungCap('a', { bao_luc: 3, mau_me: 3 })]);
      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow(/violence/i);
      await expect(svc.kiemTra(pngKhac(2), 'test')).rejects.not.toThrow(
        /bao_luc/,
      );
    });
  });

  describe('gộp kết quả nhiều nhà cung cấp', () => {
    it('lấy điểm CAO NHẤT, không lấy trung bình', async () => {
      // Một bên chắc chắn thấy vi phạm là đủ để chặn; lấy trung bình sẽ để bên
      // "không nhận ra" pha loãng mất kết luận đúng của bên kia.
      const svc = dungService([
        nhaCungCap('a', { khieu_dam: 0 }),
        nhaCungCap('b', { khieu_dam: 3 }),
      ]);
      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow(/sexual content/i);
    });

    it('gộp được các nhóm KHÁC nhau từ hai bên', async () => {
      const svc = dungService([
        nhaCungCap('vision', { khieu_dam: 0, bao_luc: 0 }),
        nhaCungCap('gemini', { mau_me: 3 }),
      ]);
      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow(/graphic injury/i);
    });

    it('cả hai đều sạch thì cho qua', async () => {
      const svc = dungService([
        nhaCungCap('vision', { khieu_dam: 0, goi_duc: 1, bao_luc: 0 }),
        nhaCungCap('gemini', { mau_me: 0, vu_khi: 1, ma_tuy: 0 }),
      ]);
      await expect(svc.kiemTra(PNG, 'test')).resolves.toBeTruthy();
    });
  });

  describe('fail-closed', () => {
    it('MỌI nhà cung cấp lỗi → CHẶN, không cho qua', async () => {
      const svc = dungService([nhaCungCap('a', new Error('mạng hỏng'))]);
      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow(
        /could not be checked/i,
      );
    });

    it('câu báo lỗi nói đó là lỗi hệ thống, KHÔNG đổ cho ảnh người dùng', async () => {
      const svc = dungService([nhaCungCap('a', new Error('timeout'))]);
      await expect(svc.kiemTra(PNG, 'test')).rejects.not.toThrow(
        /blocked|content check \(/i,
      );
    });

    it('một bên lỗi nhưng bên còn lại thấy vi phạm → vẫn chặn đúng lý do', async () => {
      const svc = dungService([
        nhaCungCap('a', new Error('sập')),
        nhaCungCap('b', { bao_luc: 3 }),
      ]);
      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow(/violence/i);
    });

    it('một bên lỗi và bên còn lại thấy SẠCH → vẫn CHẶN, vì chưa kiểm đủ', async () => {
      // Điểm dễ làm sai nhất: "có một bên bảo sạch" không đồng nghĩa "đã kiểm
      // xong". Bên hỏng có thể chính là bên phụ trách nhóm vi phạm.
      const svc = dungService([
        nhaCungCap('a', new Error('sập')),
        nhaCungCap('b', { khieu_dam: 0 }),
      ]);
      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow(
        /could not be checked/i,
      );
    });

    it('KHÔNG có nhà cung cấp nào mà vẫn bật → chặn hết (cấu hình sai)', async () => {
      const svc = dungService([]);
      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow(
        /could not be checked/i,
      );
    });
  });

  describe('tắt kiểm duyệt', () => {
    it('MODERATION_ENABLED=false thì cho qua, nhưng VẪN chặn GIF và file không phải ảnh', async () => {
      const svc = dungService([nhaCungCap('a', { khieu_dam: 3 })], 'false');
      await expect(svc.kiemTra(PNG, 'test')).resolves.toBeTruthy();
      // Hai cửa này là chuyện đúng đắn của dữ liệu, không phải chuyện kiểm
      // duyệt — tắt kiểm duyệt không được mở lại chúng.
      await expect(svc.kiemTra(GIF, 'test')).rejects.toThrow(/Animated GIFs/i);
      await expect(svc.kiemTra(PDF, 'test')).rejects.toThrow(/not a valid/i);
    });
  });

  describe('nhớ ảnh đã từ chối', () => {
    it('cùng một ảnh gửi lại thì chặn NGAY, không gọi API lần nữa', async () => {
      const p = nhaCungCap('a', { khieu_dam: 3 });
      const svc = dungService([p]);

      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow();
      expect(p.soLanGoi).toBe(1);

      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow(
        /rejected by the content check/i,
      );
      expect(p.soLanGoi).toBe(1); // không tăng
    });

    it('ảnh KHÁC vẫn được kiểm bình thường', async () => {
      const p = nhaCungCap('a', { khieu_dam: 3 });
      const svc = dungService([p]);
      await expect(svc.kiemTra(pngKhac(1), 'test')).rejects.toThrow();
      await expect(svc.kiemTra(pngKhac(2), 'test')).rejects.toThrow();
      expect(p.soLanGoi).toBe(2);
    });

    it('ảnh SẠCH không bị ghi vào danh sách chặn', async () => {
      const p = nhaCungCap('a', {});
      const svc = dungService([p]);
      await svc.kiemTra(PNG, 'test');
      await svc.kiemTra(PNG, 'test');
      expect(p.soLanGoi).toBe(2);
    });

    it('lỗi hệ thống KHÔNG ghi ảnh vào danh sách chặn', async () => {
      // Nhớ nhầm thì một lần Google chập chờn sẽ cấm vĩnh viễn một ảnh bình
      // thường, cho tới khi khởi động lại tiến trình.
      let hong = true;
      const p: NhaCungCapKiemDuyet = {
        ten: 'a',
        bat: true,
        async cham() {
          if (hong) throw new Error('sập');
          return {};
        },
      };
      const svc = dungService([p]);
      await expect(svc.kiemTra(PNG, 'test')).rejects.toThrow(
        /could not be checked/i,
      );

      hong = false; // API hồi phục
      await expect(svc.kiemTra(PNG, 'test')).resolves.toBeTruthy();
    });
  });

  describe('kiemTraNeuLaAnh — đường đính kèm thẻ', () => {
    it('tài liệu không phải ảnh thì cho qua, không gọi API', async () => {
      const p = nhaCungCap('a', { khieu_dam: 3 });
      const svc = dungService([p]);
      await expect(svc.kiemTraNeuLaAnh(PDF, 'test')).resolves.toEqual({
        laAnh: false,
      });
      expect(p.soLanGoi).toBe(0);
    });

    it('ảnh đội lốt tài liệu VẪN bị kiểm', async () => {
      // Nhận dạng theo magic bytes nên đổi tên thành .pdf không giúp gì.
      const svc = dungService([nhaCungCap('a', { khieu_dam: 3 })]);
      await expect(svc.kiemTraNeuLaAnh(PNG, 'test')).rejects.toThrow(
        /sexual content/i,
      );
    });

    it('ảnh sạch thì báo là ảnh và trả mime thật', async () => {
      const svc = dungService([nhaCungCap('a', {})]);
      await expect(svc.kiemTraNeuLaAnh(PNG, 'test')).resolves.toEqual({
        laAnh: true,
        mime: 'image/png',
        duoi: '.png',
      });
    });
  });
});
