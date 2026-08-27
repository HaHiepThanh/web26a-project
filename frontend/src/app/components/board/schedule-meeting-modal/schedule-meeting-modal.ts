import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideCalendarPlus,
  LucideDownload,
  LucideFileText,
  LucideTriangleAlert,
  LucideUpload,
  LucideVideo,
  LucideX,
} from '@lucide/angular';
import { ApiBoardMember } from '../../../models';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { GoogleCalendarService } from '../../../services/google-calendar.service';
import { MeetingsService } from '../../../services/meetings.service';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { docIcs, taoIcs } from '../../../utils/ics.util';
import {
  moTaQuyTac, QuyTacLap, TAN_SUAT, TanSuat, taoRrule, TOI_DA_LAN, traiQuyTac,
} from '../../../utils/lap-lai.util';
import { MIME_ICS, taiVeFile, tenFileAnToan } from '../../../utils/download.util';

/** Các mốc nhắc cho chọn. 0 = không nhắc. */
export const MOC_NHAC = [
  { phut: 0, nhan: 'No reminder' },
  { phut: 5, nhan: '5 minutes before' },
  { phut: 10, nhan: '10 minutes before' },
  { phut: 30, nhan: '30 minutes before' },
  { phut: 60, nhan: '1 hour before' },
  { phut: 1440, nhan: '1 day before' },
];

/**
 * Gợi ý độ dài để bấm nhanh — KHÔNG còn là cách nhập chính.
 *
 * Trước đây người dùng chỉ chọn được "bao lâu" (30 phút, 60 phút…), nên một
 * cuộc 09:15–10:45 phải nhẩm ra 90 rồi tìm trong danh sách. Nay nhập thẳng giờ
 * bắt đầu và giờ kết thúc; mấy nút này chỉ để bấm cho nhanh những mốc hay dùng.
 */
export const GOI_Y_DAI = [15, 30, 45, 60, 90, 120];

/** Một người có thể mời, kèm lý do vì sao không mời được (nếu có). */
export interface UngVien {
  id: string;
  ten: string;
  email: string;
  avatarUrl: string | null;
  moiDuoc: boolean;
}

@Component({
  selector: 'app-schedule-meeting-modal',
  imports: [
    FormsModule,
    LucideCalendarPlus,
    LucideDownload,
    LucideFileText,
    LucideTriangleAlert,
    LucideUpload,
    LucideVideo,
    LucideX,
    UserAvatar,
  ],
  templateUrl: './schedule-meeting-modal.html',
})
export class ScheduleMeetingModal {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly calendar = inject(GoogleCalendarService);
  private readonly meetings = inject(MeetingsService);

  readonly isOpen = input<boolean>(false);
  readonly boardId = input<string>('');
  readonly boardName = input<string>('');

  readonly close = output<void>();
  /** Tạo xong — trang board hiện toast và nạp lại danh sách. */
  readonly created = output<{ title: string; meetUrl: string | null }>();

  readonly mocNhac = MOC_NHAC;
  readonly goiYDai = GOI_Y_DAI;
  readonly tanSuat = TAN_SUAT;

  // ---------------------------------------------------------------- biểu mẫu
  readonly title = signal('');
  readonly description = signal('');
  readonly ngay = signal('');
  readonly gio = signal('');
  /** Ngày kết thúc — riêng, để đặt được cuộc họp vắt qua nửa đêm. */
  readonly ngayKetThuc = signal('');
  readonly gioKetThuc = signal('');
  readonly nhacTruoc = signal(10);

  // ------------------------------------------------------------ lặp lại
  readonly lapFreq = signal<TanSuat | ''>('');
  readonly lapCach = signal(1);
  /** 'khong' = lặp mãi (bị chặn ở trần), 'sau' = sau N lần, 'ngay' = tới ngày. */
  readonly lapKetThuc = signal<'khong' | 'sau' | 'ngay'>('khong');
  readonly lapSoLan = signal(10);
  readonly lapDenNgay = signal('');

  // ------------------------------------------------------- nhập theo khoảng
  // --------------------------------------------------- dán link Google
  readonly linkGoogle = signal('');
  readonly dangDocLink = signal(false);
  readonly kemMeet = signal(true);
  readonly daChon = signal<string[]>([]);

  readonly dangGui = signal(false);
  readonly dangNhapFile = signal(false);
  readonly loi = signal<string | null>(null);
  readonly loiTruong = signal<Record<string, string>>({});
  readonly thongBaoNhap = signal<string | null>(null);
  /** Đọc được bao nhiêu sự kiện từ file — hiện lại để người dùng biết khoảng
   *  ngày họ chọn có đúng ý không. */
  readonly soSuKienDocDuoc = signal(0);

  readonly dangTaiNguoi = signal(false);
  readonly ungVien = signal<UngVien[]>([]);

  /**
   * Múi giờ của trình duyệt, ví dụ 'Asia/Ho_Chi_Minh'.
   */
  readonly muiGio = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  readonly soNguoiMoiDuoc = computed(() => this.ungVien().filter((u) => u.moiDuoc).length);
  readonly coNguoiChuaNoi = computed(() => this.ungVien().some((u) => !u.moiDuoc));
  readonly nguoiDaChon = computed(() => {
    const set = new Set(this.daChon());
    return this.ungVien().filter((u) => set.has(u.id));
  });

  readonly userEmail = computed(() => this.auth.currentUser()?.email ?? '');
  readonly organizerName = computed(
    () =>
      this.auth.currentUser()?.displayName ||
      this.auth.currentUser()?.email ||
      'Thanh Hà Hiệp',
  );

  inGioPdf(): string {
    const moc = this.mocThoiGian();
    const b = moc ? moc.batDau : new Date();
    const k = moc ? moc.ketThuc : new Date(Date.now() + 30 * 60_000);
    const fmt = (d: Date) => {
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${m}${ampm}`;
    };
    const tzLabel =
      this.muiGio === 'Asia/Ho_Chi_Minh'
        ? 'Giờ Đông Dương - TP Hồ Chí Minh'
        : this.muiGio;
    return `${fmt(b)} - ${fmt(k)} (${tzLabel})`;
  }

  inNgayPdf(): string {
    const moc = this.mocThoiGian();
    const d = moc ? moc.batDau : new Date();
    const daysVi = ['chủ nhật', 'thứ 2', 'thứ 3', 'thứ 4', 'thứ 5', 'thứ 6', 'thứ 7'];
    const thu = daysVi[d.getDay()];
    return `${thu}, ${d.getDate()} Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
  }

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.datLaiBieuMau();
        void this.taiNguoi();
      }
    });
  }

  // ---------------------------------------------------------------- dữ liệu

  private async taiNguoi(): Promise<void> {
    const id = this.boardId();
    if (!id) return;
    this.dangTaiNguoi.set(true);
    try {
      const rows = await this.api.get<ApiBoardMember[]>(`/boards/${id}/members`);
      this.ungVien.set(
        rows
          .filter((r) => r.user)
          .map((r) => ({
            id: r.user!.id,
            ten: r.user!.displayName || r.user!.email,
            email: r.user!.email,
            avatarUrl: r.user!.avatarUrl,
            moiDuoc: r.user!.googleLinked === true,
          }))
          .sort((a, b) => Number(b.moiDuoc) - Number(a.moiDuoc) || a.ten.localeCompare(b.ten)),
      );
    } catch {
      this.loi.set('Could not load the people on this board. Close and try again.');
    } finally {
      this.dangTaiNguoi.set(false);
    }
  }

  private datLaiBieuMau(): void {
    const t = new Date(Date.now() + 60 * 60_000);
    t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);

    this.title.set(this.boardName() ? `${this.boardName()} sync` : '');
    this.description.set('');
    const k = new Date(t.getTime() + 30 * 60_000);
    this.ngay.set(chuoiNgay(t));
    this.gio.set(chuoiGio(t));
    this.ngayKetThuc.set(chuoiNgay(k));
    this.gioKetThuc.set(chuoiGio(k));
    this.nhacTruoc.set(10);
    this.lapFreq.set('');
    this.lapCach.set(1);
    this.lapKetThuc.set('khong');
    this.lapSoLan.set(10);
    this.lapDenNgay.set('');
    this.linkGoogle.set('');
    this.kemMeet.set(true);
    this.daChon.set([]);
    this.loi.set(null);
    this.loiTruong.set({});
    this.thongBaoNhap.set(null);
  }

  /**
   * Dán link Google Calendar → tự điền cả biểu mẫu.
   *
   * Link CHỈ mang định danh sự kiện, không mang nội dung, nên phải gọi Calendar
   * API để đọc — xem ghi chú ở `tachLinkGoogle`. Việc còn lại của người dùng
   * đúng như bạn muốn: chỉ chọn thành viên.
   */
  async docLink(): Promise<void> {
    const url = this.linkGoogle().trim();
    if (!url || this.dangDocLink()) return;

    this.dangDocLink.set(true);
    this.loi.set(null);
    try {
      const { suKien, error } = await this.calendar.docTheoLink(url);
      if (error || !suKien) {
        this.loi.set(error ?? 'Could not read that event.');
        return;
      }

      const b = new Date(suKien.startAt);
      const k = new Date(suKien.endAt);
      this.title.set(suKien.title);
      this.description.set(suKien.description ?? '');
      this.ngay.set(chuoiNgay(b));
      this.gio.set(chuoiGio(b));
      this.ngayKetThuc.set(chuoiNgay(k));
      this.gioKetThuc.set(chuoiGio(k));
      this.kemMeet.set(!!suKien.meetUrl);

      // Khách mời trong sự kiện Google khớp được với ai trên board thì tick sẵn.
      // Người không phải thành viên board thì bỏ qua — app không mời họ được.
      const theoEmail = new Set(suKien.attendeeEmails);
      const khop = this.ungVien()
        .filter((u) => u.moiDuoc && theoEmail.has(u.email.toLowerCase()))
        .map((u) => u.id);
      if (khop.length) this.daChon.set(khop);

      const soKhac = suKien.attendeeEmails.length - khop.length;
      const themVe = soKhac > 0 ? ` ${soKhac} guest(s) are not members of this board and were skipped.` : '';
      this.thongBaoNhap.set(
        `Loaded "${suKien.title}" from Google Calendar.${khop.length ? ` Pre-selected ${khop.length} board member(s).` : ''}${themVe} Pick who to invite, then create.`,
      );
      this.loiTruong.set({});
    } finally {
      this.dangDocLink.set(false);
    }
  }

  doiChon(id: string): void {
    this.daChon.update((ds) => (ds.includes(id) ? ds.filter((x) => x !== id) : [...ds, id]));
  }

  chonHet(): void {
    const tatCa = this.ungVien().filter((u) => u.moiDuoc).map((u) => u.id);
    this.daChon.set(this.daChon().length === tatCa.length ? [] : tatCa);
  }

  // ---------------------------------------------------------------- Import / Export

  async nhapFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;

    this.loi.set(null);
    this.thongBaoNhap.set(null);
    this.dangNhapFile.set(true);

    try {
      const isPdf = f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf';

      if (isPdf) {
        // Nhập từ file PDF xuất từ Google Calendar
        const pdfData = await this.meetings.parsePdf(f);

        if (pdfData.title) {
          this.title.set(pdfData.title);
        }
        if (pdfData.description) {
          this.description.set(pdfData.description);
        }
        if (pdfData.date) {
          this.ngay.set(pdfData.date);
        }
        if (pdfData.startTime) {
          this.gio.set(pdfData.startTime);
        }
        if (pdfData.duration && pdfData.date && pdfData.startTime) {
          // Ghi ĐÚNG độ dài đọc được. Bản cũ ép nó về mốc gần nhất trong danh
          // sách chọn sẵn, nên một buổi 50 phút bị đổi thành 45 — sai lệch âm
          // thầm ngay ở bước nhập.
          const k = new Date(
            new Date(`${pdfData.date}T${pdfData.startTime}`).getTime() +
              pdfData.duration * 60_000,
          );
          this.ngayKetThuc.set(chuoiNgay(k));
          this.gioKetThuc.set(chuoiGio(k));
        }
        if (pdfData.meetUrl) {
          this.kemMeet.set(true);
        }

        // Tự động khớp danh sách email với các thành viên trong board
        let soNguoiKhop = 0;
        if (pdfData.attendeeEmails && pdfData.attendeeEmails.length > 0) {
          const emailSet = new Set(pdfData.attendeeEmails.map((em) => em.toLowerCase()));
          const khopUids = this.ungVien()
            .filter((u) => u.moiDuoc && emailSet.has(u.email.toLowerCase()))
            .map((u) => u.id);

          if (khopUids.length > 0) {
            soNguoiKhop = khopUids.length;
            this.daChon.set([...new Set([...this.daChon(), ...khopUids])]);
          }
        }

        const matchMsg = soNguoiKhop > 0 ? ` & matched ${soNguoiKhop} board member(s)` : '';
        this.thongBaoNhap.set(
          `Imported Google Calendar details from PDF "${f.name}"${matchMsg}. You can review and edit before scheduling.`,
        );
        this.loiTruong.set({});
      } else {
        // Nhập từ file .ics
        const text = await f.text();
        // Khoảng ngày do người dùng chọn — để nhập đúng đoạn lịch họ cần thay
        // vì nuốt cả file. Để trống cả hai thì lấy tất như trước.
        const kq = docIcs(text);
        if (kq.loi) {
          this.loi.set(kq.loi);
          return;
        }

        const sk = kq.suKien[0];
        if (!sk) {
          this.loi.set('No usable events found in this .ics file.');
          return;
        }

        this.soSuKienDocDuoc.set(kq.suKien.length);

        // 1. Tiêu đề
        if (sk.title && sk.title !== '(untitled event)') {
          this.title.set(sk.title);
        }

        // 2. Mô tả
        if (sk.description) {
          this.description.set(sk.description);
        }

        // 3. Thời gian bắt đầu & kết thúc
        const batDau = new Date(sk.startAt);
        const ketThuc = new Date(sk.endAt);
        this.ngay.set(chuoiNgay(batDau));
        this.gio.set(chuoiGio(batDau));

        // 4. Giờ kết thúc — lấy ĐÚNG từ file, không ép về mốc chọn sẵn nữa.
        this.ngayKetThuc.set(chuoiNgay(ketThuc));
        this.gioKetThuc.set(chuoiGio(ketThuc));

        // 5. Quy tắc lặp, nếu file có
        if (sk.quyTac) {
          this.lapFreq.set(sk.quyTac.freq);
          this.lapCach.set(sk.quyTac.interval ?? 1);
          if (sk.quyTac.count) {
            this.lapKetThuc.set('sau');
            this.lapSoLan.set(sk.quyTac.count);
          } else if (sk.quyTac.until) {
            this.lapKetThuc.set('ngay');
            this.lapDenNgay.set(chuoiNgay(new Date(sk.quyTac.until)));
          } else {
            this.lapKetThuc.set('khong');
          }
        }

        // 5. Nhắc trước
        if (sk.remindMinutes !== null) {
          const matchRemind = MOC_NHAC.find((m) => m.phut === sk.remindMinutes);
          if (matchRemind) {
            this.nhacTruoc.set(sk.remindMinutes);
          }
        }

        // 6. Meet room
        if (sk.location && laLinkMeet(sk.location)) {
          this.kemMeet.set(true);
        }

        // 7. Khớp email người dự với thành viên board
        let soNguoiKhop = 0;
        if (sk.attendeeEmails.length > 0) {
          const emailSet = new Set(sk.attendeeEmails.map((em) => em.toLowerCase()));
          const khopUids = this.ungVien()
            .filter((u) => u.moiDuoc && emailSet.has(u.email.toLowerCase()))
            .map((u) => u.id);

          if (khopUids.length > 0) {
            soNguoiKhop = khopUids.length;
            this.daChon.set([...new Set([...this.daChon(), ...khopUids])]);
          }
        }

        const matchMsg = soNguoiKhop > 0 ? ` and pre-selected ${soNguoiKhop} board member(s)` : '';
        // Nói rõ file có bao nhiêu buổi và ta đang mở buổi nào: người dùng chọn
        // một khoảng ngày rồi chỉ thấy MỘT biểu mẫu thì rất dễ tưởng đã mất
        // phần còn lại.
        const nhieu =
          kq.suKien.length > 1
            ? ` The file has ${kq.suKien.length} events in this range — the first one is loaded below; adjust the date range or import again for the others.`
            : '';
        this.thongBaoNhap.set(
          `Imported meeting details from "${f.name}"${matchMsg}.${nhieu} You can adjust any fields and invitees before scheduling.`,
        );
        this.loiTruong.set({});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not parse the calendar file.';
      this.loi.set(msg);
    } finally {
      this.dangNhapFile.set(false);
    }
  }

  /** Alias cho template hoặc test */
  nhapFileIcs(e: Event): Promise<void> {
    return this.nhapFile(e);
  }

  xuatIcs(): void {
    const t = this.title().trim() || (this.boardName() ? `${this.boardName()} meeting` : 'Meeting');
    const moc = this.mocThoiGian();
    const batDau = moc ? moc.batDau.toISOString() : new Date().toISOString();
    const ketThuc = moc
      ? moc.ketThuc.toISOString()
      : new Date(Date.now() + 30 * 60_000).toISOString();

    const chon = new Set(this.daChon());
    const khach = this.ungVien().filter((u) => chon.has(u.id));

    const icsContent = taoIcs([
      {
        id: `meeting-${Date.now()}`,
        title: t,
        description: this.description().trim() || null,
        startAt: batDau,
        endAt: ketThuc,
        location: this.kemMeet() ? 'Google Meet' : null,
        attendees: khach.map((k) => ({ name: k.ten, email: k.email })),
        remindMinutes: this.nhacTruoc(),
        quyTac: this.quyTacHienTai(),
      },
    ]);

    taiVeFile(tenFileAnToan(t, 'ics'), icsContent, MIME_ICS);
  }

  xuatPdf(): void {
    window.print();
  }

  // ---------------------------------------------------------------- gửi

  /**
   * Mốc bắt đầu và kết thúc, từ giờ NHẬP TƯỜNG MINH.
   *
   * Trước đây chỉ nhập được "bao lâu", nên một cuộc 09:15–10:45 phải tự nhẩm ra
   * 90 phút rồi tìm trong danh sách chọn sẵn — và những độ dài không có trong
   * danh sách thì đành chịu.
   *
   * `new Date('2026-09-01T14:30')` (không hậu tố Z) được JS hiểu theo giờ ĐỊA
   * PHƯƠNG — đúng ý, vì người dùng gõ giờ theo đồng hồ của họ.
   */
  private mocThoiGian(): { batDau: Date; ketThuc: Date } | null {
    if (!this.ngay() || !this.gio() || !this.gioKetThuc()) return null;
    const batDau = new Date(`${this.ngay()}T${this.gio()}`);
    // Ngày kết thúc để trống thì hiểu là cùng ngày — trường này chỉ cần khi
    // cuộc họp vắt qua nửa đêm.
    const ngayK = this.ngayKetThuc() || this.ngay();
    const ketThuc = new Date(`${ngayK}T${this.gioKetThuc()}`);
    if (Number.isNaN(batDau.getTime()) || Number.isNaN(ketThuc.getTime())) return null;
    return { batDau, ketThuc };
  }

  /** Quy tắc lặp dựng từ các ô trên biểu mẫu. `null` = không lặp. */
  quyTacHienTai(): QuyTacLap | null {
    const freq = this.lapFreq();
    if (!freq) return null;
    const q: QuyTacLap = { freq, interval: Math.max(1, this.lapCach()) };
    if (this.lapKetThuc() === 'sau') q.count = Math.max(1, this.lapSoLan());
    else if (this.lapKetThuc() === 'ngay' && this.lapDenNgay()) {
      q.until = new Date(`${this.lapDenNgay()}T23:59:59`).toISOString();
    }
    return q;
  }

  /** Câu mô tả quy tắc, hiện ngay dưới ô chọn để người dùng đọc lại cho chắc. */
  readonly moTaLap = computed(() => moTaQuyTac(this.quyTacHienTai()));

  /** Bao nhiêu buổi sẽ được tạo — con số này quyết định người dùng bấm hay không. */
  readonly soBuoi = computed(() => {
    const moc = this.mocThoiGian();
    const q = this.quyTacHienTai();
    if (!moc || !q) return 1;
    return traiQuyTac(moc.batDau, q).length;
  });

  readonly chamTranLap = computed(() => this.soBuoi() >= TOI_DA_LAN);

  /** Độ dài hiện tại, tính bằng phút. `null` khi giờ chưa hợp lệ. */
  readonly soPhut = computed(() => {
    const moc = this.mocThoiGian();
    if (!moc) return null;
    return Math.round((moc.ketThuc.getTime() - moc.batDau.getTime()) / 60_000);
  });

  /** Nút bấm nhanh: đặt giờ kết thúc = giờ bắt đầu + n phút. */
  datDai(phut: number): void {
    if (!this.ngay() || !this.gio()) return;
    const k = new Date(new Date(`${this.ngay()}T${this.gio()}`).getTime() + phut * 60_000);
    this.ngayKetThuc.set(chuoiNgay(k));
    this.gioKetThuc.set(chuoiGio(k));
  }

  /**
   * Đổi ngày bắt đầu — ngày kết thúc TRÔI THEO, giữ nguyên độ lệch.
   *
   * Không kéo theo thì đổi ngày bắt đầu sang tuần sau sẽ để ngày kết thúc ở lại
   * tuần này, tức giờ kết thúc nằm TRƯỚC giờ bắt đầu — và người dùng chỉ biết
   * khi bấm Tạo rồi bị báo lỗi.
   */
  datNgayBatDau(v: string): void {
    const lech = this.lechNgay();
    this.ngay.set(v);
    if (v) this.ngayKetThuc.set(congNgay(v, lech));
  }

  /** Nhảy về hôm nay, giữ nguyên giờ và độ dài đang chọn. */
  homNay(): void {
    this.datNgayBatDau(chuoiNgay(new Date()));
  }

  /**
   * Ngày kết thúc lệch ngày bắt đầu bao nhiêu ngày.
   *
   * Kẹp về 0 khi âm: trạng thái đó là dữ liệu hỏng (kết thúc trước khi bắt
   * đầu), và kéo theo một độ lệch âm chỉ làm hỏng tiếp.
   */
  private lechNgay(): number {
    if (!this.ngay() || !this.ngayKetThuc()) return 0;
    const a = new Date(`${this.ngay()}T00:00:00`).getTime();
    const b = new Date(`${this.ngayKetThuc()}T00:00:00`).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.max(0, Math.round((b - a) / 86_400_000));
  }

  private kiemTra(): boolean {
    const loi: Record<string, string> = {};

    if (!this.title().trim()) loi['title'] = 'Give the meeting a title.';
    const moc = this.mocThoiGian();
    if (!moc) loi['time'] = 'Pick a valid start and end time.';
    else if (moc.ketThuc.getTime() <= moc.batDau.getTime()) {
      // Database có `check (end_at > start_at)` — để lọt xuống là lỗi Postgres
      // 500 khó hiểu. Và cuộc họp kết thúc trước khi bắt đầu là vô nghĩa.
      loi['time'] =
        'The end time must be after the start time. For a meeting that runs past midnight, set the end date to the next day.';
    } else if (moc.batDau.getTime() < Date.now()) {
      loi['time'] = 'That time is in the past. Pick a time from now on.';
    }
    if (this.lapKetThuc() === 'ngay' && this.lapFreq() && !this.lapDenNgay()) {
      loi['lap'] = 'Pick the date the repeat should stop.';
    }
    if (this.daChon().length === 0) loi['people'] = 'Invite at least one person.';

    this.loiTruong.set(loi);
    return Object.keys(loi).length === 0;
  }

  async guiDi(): Promise<void> {
    if (this.dangGui()) return;
    this.loi.set(null);
    if (!this.kiemTra()) return;

    const moc = this.mocThoiGian();
    if (!moc) return;

    this.dangGui.set(true);
    try {
      const chon = new Set(this.daChon());
      const khach = this.ungVien().filter((u) => chon.has(u.id));
      const quyTac = this.quyTacHienTai();

      // BƯỚC 1 — tạo trên Google (và Google gửi thư mời).
      const kq = await this.calendar.taoLichHop({
        title: this.title().trim(),
        description: this.description().trim() || null,
        startAt: moc.batDau.toISOString(),
        endAt: moc.ketThuc.toISOString(),
        timeZone: this.muiGio,
        remindMinutes: this.nhacTruoc(),
        khach: khach.map((k) => ({ email: k.email })),
        kemMeet: this.kemMeet(),
        // Google tự dựng CẢ CHUỖI từ quy tắc này và chỉ gửi MỘT thư mời phủ
        // mọi lần diễn ra. Tự trải rồi tạo N sự kiện riêng sẽ bắn N thư vào
        // hộp thư người nhận, và họ phải trả lời từng cái.
        rrule: taoRrule(quyTac),
      });
      if (kq.error) {
        this.loi.set(kq.error);
        return;
      }

      // BƯỚC 2 — lưu bản sao để chuông nhắc được trước giờ.
      try {
        await this.meetings.luu({
          boardId: this.boardId(),
          title: this.title().trim(),
          description: this.description().trim() || null,
          startAt: moc.batDau.toISOString(),
          endAt: moc.ketThuc.toISOString(),
          timeZone: this.muiGio,
          remindMinutes: this.nhacTruoc(),
          attendeeIds: [...chon],
          googleEventId: kq.googleEventId ?? null,
          googleHtmlLink: kq.googleHtmlLink ?? null,
          meetUrl: kq.meetUrl ?? null,
          recurrence: taoRrule(quyTac)?.replace(/^RRULE:/, '') ?? null,
          // TRẢI quy tắc ở CLIENT rồi gửi từng mốc: bộ nhắc của app đặt hẹn
          // giờ theo mốc cụ thể, nó không biết đọc quy tắc lặp. Trải ở đây
          // cũng giữ phép tính lặp ở đúng MỘT nơi (lap-lai.util.ts, nơi đã có
          // test canh những bẫy như ngày 31 hằng tháng) thay vì viết lại ở
          // server.
          occurrences: quyTac
            ? traiQuyTac(moc.batDau, quyTac).map((d) => d.toISOString())
            : undefined,
        });
      } catch {
        this.loi.set(
          'The Google Calendar event was created and invitations were sent, but we could not save it here — this meeting will not show a reminder in the app.',
        );
        return;
      }

      this.created.emit({ title: this.title().trim(), meetUrl: kq.meetUrl ?? null });
      this.close.emit();
    } finally {
      this.dangGui.set(false);
    }
  }
}

/** Cộng thêm `n` ngày vào chuỗi 'YYYY-MM-DD'. */
function congNgay(ngay: string, n: number): string {
  const d = new Date(`${ngay}T00:00:00`);
  d.setDate(d.getDate() + n);
  return chuoiNgay(d);
}

function hai(n: number): string {
  return String(n).padStart(2, '0');
}
function chuoiNgay(d: Date): string {
  return `${d.getFullYear()}-${hai(d.getMonth() + 1)}-${hai(d.getDate())}`;
}
function chuoiGio(d: Date): string {
  return `${hai(d.getHours())}:${hai(d.getMinutes())}`;
}
function laLinkMeet(v: string | null): boolean {
  return !!v && /^https:\/\/meet\.google\.com\/[A-Za-z0-9-]+$/.test(v);
}
