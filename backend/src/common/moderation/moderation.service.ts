import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  doanLoaiAnh,
  DUOI_THEO_LOAI,
  LoaiAnh,
  MIME_THEO_LOAI,
} from './anh.util';
import { laTepThucThi } from './tep-thuc-thi.util';
import {
  KetQuaKiemDuyet,
  MucDo,
  NGUONG_CHAN,
  NhaCungCapKiemDuyet,
  NhomViPham,
  TEN_NHOM,
} from './moderation.types';
import { GeminiVisionProvider } from './gemini-vision.provider';
import { docCauHinh } from './cau-hinh.util';
import { VisionProvider } from './vision.provider';

/**
 * Nhớ hash của ảnh ĐÃ BỊ TỪ CHỐI, để lần sau chặn ngay không tốn lượt gọi API.
 *
 * Nằm trong bộ nhớ tiến trình nên khởi động lại là mất — chấp nhận được, đây
 * chỉ là bộ đệm tiết kiệm quota, không phải nguồn sự thật. Có trần để một người
 * thử 10.000 ảnh khác nhau không làm phình bộ nhớ.
 */
const TRAN_BO_NHO = 500;

/** Ảnh động: mọi API kiểm duyệt chỉ quét MỘT khung hình — xem ghi chú ở `kiemTra`. */
const LOAI_BI_CAM: LoaiAnh[] = ['gif'];

/**
 * Ảnh lớn hơn ngần này thì không gửi đi chấm.
 *
 * Cả Vision lẫn Gemini đều nhận ảnh dưới dạng base64 nhúng thẳng vào thân
 * request, mà base64 làm phình ~33%. 8MB ảnh → ~10.7MB request, vẫn dưới trần
 * 20MB của cả hai bên nhưng đã là chỗ nên dừng.
 *
 * Đường ảnh nền board giới hạn 5MB nên không bao giờ chạm ngưỡng này; chỉ đường
 * đính kèm thẻ (10MB) mới có thể vượt. Chặn tại đây kèm câu nói rõ lý do vẫn
 * hơn là để request lỗi rồi người dùng nhận về "không kiểm được" khó hiểu.
 */
const KICH_THUOC_TOI_DA = 8 * 1024 * 1024;

@Injectable()
export class ModerationService implements OnModuleInit {
  private readonly logger = new Logger(ModerationService.name);
  private readonly nhaCungCap: NhaCungCapKiemDuyet[];
  private readonly bat: boolean;
  private readonly hashXau = new Set<string>();

  constructor(
    config: ConfigService,
    vision: VisionProvider,
    gemini: GeminiVisionProvider,
  ) {
    this.nhaCungCap = [vision, gemini].filter((p) => p.bat);

    // Mặc định BẬT khi có ít nhất một nhà cung cấp. Phải khai tường minh
    // `MODERATION_ENABLED=false` mới tắt được — tắt là một quyết định, không
    // được là hệ quả tình cờ của việc thiếu biến môi trường.
    const khai = docCauHinh(config, 'MODERATION_ENABLED');
    this.bat =
      khai === undefined ? this.nhaCungCap.length > 0 : khai !== 'false';
  }

  onModuleInit(): void {
    if (!this.bat) {
      this.logger.warn(
        'KIỂM DUYỆT ẢNH ĐANG TẮT — mọi ảnh tải lên đều được chấp nhận. ' +
          'Đặt GOOGLE_VISION_API_KEY và/hoặc GEMINI_API_KEY để bật.',
      );
      return;
    }
    if (this.nhaCungCap.length === 0) {
      // Bật mà không có nhà cung cấp nào là cấu hình sai. Vì đã chọn fail-closed
      // nên trạng thái này CHẶN MỌI ẢNH — kêu thật to để không ai phải ngồi đoán.
      this.logger.error(
        'MODERATION_ENABLED=true nhưng KHÔNG có nhà cung cấp nào được cấu hình — ' +
          'MỌI ảnh tải lên sẽ bị từ chối. Đặt GOOGLE_VISION_API_KEY hoặc GEMINI_API_KEY.',
      );
      return;
    }
    this.logger.log(
      `Kiểm duyệt ảnh: BẬT (${this.nhaCungCap.map((p) => p.ten).join(', ')})`,
    );
  }

  /**
   * Cửa duy nhất cho mọi ảnh đi vào hệ thống. Ném `BadRequestException` khi từ chối.
   *
   * ⚠️ PHẢI gọi TRƯỚC lệnh ghi vào Storage, không phải sau. Bucket `avatars` là
   *    bucket CÔNG KHAI: lưu trước rồi quét sau nghĩa là có một khoảng thời gian
   *    ảnh đã có URL công khai, và chỉ cần vài giây là đủ để phát tán.
   *
   * Trả về mime + đuôi file SUY TỪ NỘI DUNG THẬT, để nơi gọi dùng thay cho
   * chuỗi client khai.
   */
  async kiemTra(
    buffer: Buffer,
    boiCanh: string,
  ): Promise<{ mime: string; duoi: string; ketQua: KetQuaKiemDuyet }> {
    const loai = doanLoaiAnh(buffer);

    // 1. Có đúng là ảnh không — hỏi NỘI DUNG, không hỏi client.
    if (!loai) {
      throw new BadRequestException(
        'That file is not a valid JPG, PNG or WEBP image.',
      );
    }

    // 2. Định dạng có kiểm duyệt được không.
    //
    // GIF bị chặn hẳn: mọi API kiểm duyệt chỉ quét MỘT khung hình. Một ảnh động
    // sạch ở khung đầu và vi phạm ở khung thứ 30 sẽ qua cửa trót lọt — tức là
    // chấp nhận GIF nghĩa là để hở một đường đi vòng có sẵn.
    if (LOAI_BI_CAM.includes(loai)) {
      throw new BadRequestException(
        'Animated GIFs are not supported. Please upload a JPG, PNG or WEBP image.',
      );
    }

    const mime = MIME_THEO_LOAI[loai];
    const duoi = DUOI_THEO_LOAI[loai];

    if (this.bat && buffer.length > KICH_THUOC_TOI_DA) {
      throw new BadRequestException(
        `Images larger than ${KICH_THUOC_TOI_DA / 1024 / 1024}MB cannot be content-checked. Please upload a smaller image.`,
      );
    }

    if (!this.bat) {
      return {
        mime,
        duoi,
        ketQua: {
          choPhep: true,
          viPham: [],
          diem: {},
          nguon: [],
          coLoi: false,
        },
      };
    }

    // 3. Ảnh này đã bị từ chối trước đó chưa — chặn ngay, khỏi tốn lượt gọi.
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (this.hashXau.has(hash)) {
      throw new BadRequestException(
        'This image was rejected by the content check. Please choose a different image.',
      );
    }

    const ketQua = await this.cham(buffer, mime);

    if (!ketQua.choPhep) {
      const laLoiHeThong = ketQua.coLoi && ketQua.viPham.length === 0;
      if (laLoiHeThong) {
        // KHÔNG ghi hash: ảnh này chưa hề bị kết luận là xấu, ta chỉ không kiểm
        // được. Nhớ nó lại thì một lần Google chập chờn sẽ cấm vĩnh viễn một
        // ảnh hoàn toàn bình thường, cho tới khi khởi động lại tiến trình.
        this.logger.error(
          `KHÔNG kiểm duyệt được ảnh (${boiCanh}) — chặn theo fail-closed. ` +
            'Đây là lỗi hệ thống, không phải nội dung ảnh.',
        );
      } else {
        this.nhoHashXau(hash);
        this.logger.warn(
          `Từ chối ảnh (${boiCanh}): ${ketQua.viPham.join(', ')} — ${JSON.stringify(ketQua.diem)}`,
        );
      }
      throw new BadRequestException(this.loiChoNguoiDung(ketQua));
    }

    return { mime, duoi, ketQua };
  }

  /**
   * Dành cho đường đính kèm thẻ — nơi nhận CẢ tài liệu lẫn ảnh.
   *
   * Không phải ảnh (PDF, docx, zip...) thì cho qua, vì đây là tính năng đính
   * kèm tệp làm việc bình thường. Là ảnh thì đi đúng cửa `kiemTra`.
   *
   * Nhận dạng bằng magic bytes chứ không bằng tên tệp, nên đổi tên ảnh thành
   * `.pdf` vẫn bị bắt là ảnh và vẫn phải qua kiểm duyệt.
   *
   * ⚠️ Giới hạn còn lại: ảnh NẰM BÊN TRONG một file PDF/Office thật thì không
   *    kiểm được — muốn thế phải render tài liệu ra ảnh trước, không nằm trong
   *    phạm vi này.
   */
  async kiemTraNeuLaAnh(
    buffer: Buffer,
    boiCanh: string,
    tenTep = '',
  ): Promise<{ laAnh: boolean; mime?: string; duoi?: string }> {
    // Chặn tệp CHẠY ĐƯỢC trước tiên, kể cả khi kiểm duyệt ảnh đang tắt: đây là
    // chuyện an toàn của tệp, không phải chuyện nội dung.
    //
    // Đính kèm được tải về qua link đã ký của chính app nên nó mang vẻ đáng
    // tin — đồng đội thấy tệp nằm trong thẻ của nhóm mình thì mở ra mà không
    // nghi ngờ. Một `.exe` ở đó là đường phát tán mã độc mượn uy tín của app.
    const loaiThucThi = laTepThucThi(buffer, tenTep);
    if (loaiThucThi) {
      this.logger.warn(
        `Chặn tệp thực thi (${boiCanh}): ${tenTep} — ${loaiThucThi}`,
      );
      throw new BadRequestException(
        `Executable files cannot be attached (detected: ${loaiThucThi}). ` +
          'Zip it or share a link instead.',
      );
    }

    if (!doanLoaiAnh(buffer)) return { laAnh: false };
    const { mime, duoi } = await this.kiemTra(buffer, boiCanh);
    return { laAnh: true, mime, duoi };
  }

  // ------------------------------------------------------------------ nội bộ

  /**
   * Chạy mọi nhà cung cấp SONG SONG rồi lấy kết luận NẶNG NHẤT của từng nhóm.
   *
   * Song song vì độ trễ khi đó là cái chậm nhất chứ không phải tổng — người
   * dùng đang ngồi chờ cái upload này.
   *
   * Lấy điểm cao nhất chứ không lấy trung bình: chỉ cần MỘT bên chắc chắn thấy
   * vi phạm là đủ để chặn. Trung bình sẽ khiến một bên "không nhận ra" pha loãng
   * mất kết luận đúng của bên kia.
   */
  private async cham(buffer: Buffer, mime: string): Promise<KetQuaKiemDuyet> {
    const ket = await Promise.allSettled(
      this.nhaCungCap.map((p) => p.cham(buffer, mime)),
    );

    const diem: Partial<Record<NhomViPham, MucDo>> = {};
    const nguon: string[] = [];
    let coLoi = this.nhaCungCap.length === 0;

    ket.forEach((r, i) => {
      const p = this.nhaCungCap[i];
      if (r.status === 'rejected') {
        coLoi = true;
        this.logger.warn(
          `Nhà cung cấp ${p.ten} lỗi: ${String(r.reason).slice(0, 200)}`,
        );
        return;
      }
      nguon.push(p.ten);
      for (const [k, v] of Object.entries(r.value)) {
        const nhom = k as NhomViPham;
        const cu = diem[nhom] ?? 0;
        if (v > cu) diem[nhom] = v;
      }
    });

    const viPham = (Object.keys(diem) as NhomViPham[]).filter(
      (n) => (diem[n] ?? 0) >= NGUONG_CHAN,
    );

    // FAIL-CLOSED. Không kiểm được thì KHÔNG cho qua.
    //
    // Đây là lựa chọn có đánh đổi rõ ràng: API của Google hỏng vài phút thì
    // không ai đổi được avatar. Chấp nhận vì ba đường upload này đều là hành
    // động hiếm và cố ý — bảo người dùng thử lại là được. Còn cho qua thì chỉ
    // cần API chập chờn đúng lúc là ảnh lọt thẳng vào bucket công khai.
    if (coLoi && viPham.length === 0) {
      return {
        choPhep: false,
        viPham: [],
        diem,
        nguon,
        coLoi: true,
      };
    }

    return { choPhep: viPham.length === 0, viPham, diem, nguon, coLoi };
  }

  /** Câu báo lỗi cho người dùng — nói đủ để họ biết phải làm gì, không hơn. */
  private loiChoNguoiDung(kq: KetQuaKiemDuyet): string {
    if (kq.coLoi && kq.viPham.length === 0) {
      // Lỗi hệ thống, KHÔNG phải lỗi của người dùng — đừng ám chỉ ảnh của họ có
      // vấn đề trong khi thực ra là ta không kiểm được.
      return 'The image could not be checked right now. Please try again in a moment.';
    }
    const ten = kq.viPham.map((n) => TEN_NHOM[n]).join(', ');
    return `This image was blocked by the content check (${ten}). Please choose a different image.`;
  }

  private nhoHashXau(hash: string): void {
    // Đầy thì bỏ mục cũ nhất. `Set` của JS giữ đúng thứ tự thêm vào nên phần tử
    // đầu tiên chính là cái cũ nhất.
    if (this.hashXau.size >= TRAN_BO_NHO) {
      const cuNhat = this.hashXau.values().next().value as string | undefined;
      if (cuNhat) this.hashXau.delete(cuNhat);
    }
    this.hashXau.add(hash);
  }
}
