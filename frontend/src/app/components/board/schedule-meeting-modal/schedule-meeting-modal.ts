import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCalendarPlus, LucideTriangleAlert, LucideVideo, LucideX } from '@lucide/angular';
import { ApiBoardMember } from '../../../models';
import { ApiService } from '../../../services/api.service';
import { GoogleCalendarService } from '../../../services/google-calendar.service';
import { MeetingsService } from '../../../services/meetings.service';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';

/** Các mốc nhắc cho chọn. 0 = không nhắc. */
export const MOC_NHAC = [
  { phut: 0, nhan: 'No reminder' },
  { phut: 5, nhan: '5 minutes before' },
  { phut: 10, nhan: '10 minutes before' },
  { phut: 30, nhan: '30 minutes before' },
  { phut: 60, nhan: '1 hour before' },
  { phut: 1440, nhan: '1 day before' },
];

export const THOI_LUONG = [15, 30, 45, 60, 90, 120];

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
  imports: [FormsModule, LucideCalendarPlus, LucideTriangleAlert, LucideVideo, LucideX, UserAvatar],
  templateUrl: './schedule-meeting-modal.html',
})
export class ScheduleMeetingModal {
  private readonly api = inject(ApiService);
  private readonly calendar = inject(GoogleCalendarService);
  private readonly meetings = inject(MeetingsService);

  readonly isOpen = input<boolean>(false);
  readonly boardId = input<string>('');
  readonly boardName = input<string>('');

  readonly close = output<void>();
  /** Tạo xong — trang board hiện toast và nạp lại danh sách. */
  readonly created = output<{ title: string; meetUrl: string | null }>();

  readonly mocNhac = MOC_NHAC;
  readonly thoiLuong = THOI_LUONG;

  // ---------------------------------------------------------------- biểu mẫu
  readonly title = signal('');
  readonly description = signal('');
  readonly ngay = signal('');
  readonly gio = signal('');
  readonly phutKeoDai = signal(30);
  readonly nhacTruoc = signal(10);
  readonly kemMeet = signal(true);
  readonly daChon = signal<string[]>([]);

  readonly dangGui = signal(false);
  readonly loi = signal<string | null>(null);
  readonly loiTruong = signal<Record<string, string>>({});

  readonly dangTaiNguoi = signal(false);
  readonly ungVien = signal<UngVien[]>([]);

  /**
   * Múi giờ của trình duyệt, ví dụ 'Asia/Ho_Chi_Minh'.
   *
   * Gửi kèm lên Google là bắt buộc: thiếu nó thì cùng một chuỗi giờ có thể được
   * hiểu theo múi giờ mặc định của lịch người tạo, và cuộc họp lệch giờ với
   * người đặt mà không ai thấy sai ở đâu.
   */
  readonly muiGio = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  readonly soNguoiMoiDuoc = computed(() => this.ungVien().filter((u) => u.moiDuoc).length);
  readonly coNguoiChuaNoi = computed(() => this.ungVien().some((u) => !u.moiDuoc));

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.datLaiBieuMau();
        void this.taiNguoi();
      }
    });
  }

  // ---------------------------------------------------------------- dữ liệu

  /**
   * Ai mời được — hỏi `GET /boards/:id/members`.
   *
   * KHÔNG dùng danh sách thành viên tổ chức có sẵn trong store: endpoint này
   * mới trả về đúng người XEM ĐƯỢC BOARD (board riêng tư thì hẹp hơn tổ chức),
   * và cũng chỉ nó mới có cờ `googleLinked`.
   */
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
    // Mặc định: một tiếng nữa, làm tròn lên mốc 5 phút cho gọn mắt.
    const t = new Date(Date.now() + 60 * 60_000);
    t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);

    this.title.set(this.boardName() ? `${this.boardName()} sync` : '');
    this.description.set('');
    this.ngay.set(chuoiNgay(t));
    this.gio.set(chuoiGio(t));
    this.phutKeoDai.set(30);
    this.nhacTruoc.set(10);
    this.kemMeet.set(true);
    this.daChon.set([]);
    this.loi.set(null);
    this.loiTruong.set({});
  }

  doiChon(id: string): void {
    this.daChon.update((ds) => (ds.includes(id) ? ds.filter((x) => x !== id) : [...ds, id]));
  }

  chonHet(): void {
    const tatCa = this.ungVien().filter((u) => u.moiDuoc).map((u) => u.id);
    this.daChon.set(this.daChon().length === tatCa.length ? [] : tatCa);
  }

  // ---------------------------------------------------------------- gửi

  /**
   * Mốc bắt đầu/kết thúc dưới dạng thời điểm tuyệt đối.
   *
   * `new Date('2026-09-01T14:30')` (không có hậu tố Z) được JS hiểu theo giờ ĐỊA
   * PHƯƠNG — đúng ý ở đây, vì người dùng gõ giờ theo đồng hồ của họ.
   */
  private mocThoiGian(): { batDau: Date; ketThuc: Date } | null {
    if (!this.ngay() || !this.gio()) return null;
    const batDau = new Date(`${this.ngay()}T${this.gio()}`);
    if (Number.isNaN(batDau.getTime())) return null;
    return { batDau, ketThuc: new Date(batDau.getTime() + this.phutKeoDai() * 60_000) };
  }

  /**
   * Kiểm tra TRƯỚC khi gọi Google.
   *
   * ⚠️ Phải làm đủ ở đây, không ỷ vào backend. Thứ tự là: tạo trên Google →
   *    rồi mới lưu về mình. Nên một lỗi phát hiện muộn (ở backend) đồng nghĩa
   *    sự kiện đã tạo và thư mời đã bay đi rồi — không thu lại được.
   */
  private kiemTra(): boolean {
    const loi: Record<string, string> = {};

    if (!this.title().trim()) loi['title'] = 'Give the meeting a title.';
    const moc = this.mocThoiGian();
    if (!moc) loi['time'] = 'Pick a valid date and time.';
    else if (moc.batDau.getTime() < Date.now()) {
      // Hẹn vào quá khứ gần như luôn là gõ nhầm, và lời nhắc sẽ không bao giờ
      // kêu. Chặn ở đây vì backend CỐ Ý không chặn (từ chối muộn chỉ đẻ ra sự
      // kiện mồ côi bên Google) — xem ghi chú ở MeetingsService.
      loi['time'] = 'That time is in the past. Pick a time from now on.';
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
        });
      } catch {
        // Sự kiện ĐÃ tạo và thư mời ĐÃ gửi — nói thẳng chuyện đó ra thay vì báo
        // một lỗi chung chung khiến người dùng bấm "Tạo" lần nữa và đẻ ra cuộc
        // họp thứ hai.
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

function hai(n: number): string {
  return String(n).padStart(2, '0');
}
/** `<input type="date">` đòi đúng dạng yyyy-MM-dd theo giờ ĐỊA PHƯƠNG —
 *  `toISOString()` sẽ trả giờ UTC và lệch ngày với ai ở múi giờ dương. */
function chuoiNgay(d: Date): string {
  return `${d.getFullYear()}-${hai(d.getMonth() + 1)}-${hai(d.getDate())}`;
}
function chuoiGio(d: Date): string {
  return `${hai(d.getHours())}:${hai(d.getMinutes())}`;
}
