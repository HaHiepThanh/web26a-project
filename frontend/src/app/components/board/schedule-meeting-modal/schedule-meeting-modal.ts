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
import { GoogleCalendarService } from '../../../services/google-calendar.service';
import { MeetingsService } from '../../../services/meetings.service';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { docIcs, taoIcs } from '../../../utils/ics.util';
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
  readonly thongBaoNhap = signal<string | null>(null);

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
    this.ngay.set(chuoiNgay(t));
    this.gio.set(chuoiGio(t));
    this.phutKeoDai.set(30);
    this.nhacTruoc.set(10);
    this.kemMeet.set(true);
    this.daChon.set([]);
    this.loi.set(null);
    this.loiTruong.set({});
    this.thongBaoNhap.set(null);
  }

  doiChon(id: string): void {
    this.daChon.update((ds) => (ds.includes(id) ? ds.filter((x) => x !== id) : [...ds, id]));
  }

  chonHet(): void {
    const tatCa = this.ungVien().filter((u) => u.moiDuoc).map((u) => u.id);
    this.daChon.set(this.daChon().length === tatCa.length ? [] : tatCa);
  }

  // ---------------------------------------------------------------- Import / Export

  async nhapFileIcs(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;

    this.loi.set(null);
    this.thongBaoNhap.set(null);

    try {
      const text = await f.text();
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

      // 4. Thời lượng
      const diffMinutes = Math.max(15, Math.round((ketThuc.getTime() - batDau.getTime()) / 60_000));
      const closestDuration = THOI_LUONG.reduce((prev, curr) =>
        Math.abs(curr - diffMinutes) < Math.abs(prev - diffMinutes) ? curr : prev,
      );
      this.phutKeoDai.set(closestDuration);

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

      const matchMsg = soNguoiKhop > 0
        ? ` and pre-selected ${soNguoiKhop} board member(s)`
        : '';
      this.thongBaoNhap.set(`Imported meeting details from "${f.name}"${matchMsg}. You can adjust any fields and invitees before scheduling.`);
      this.loiTruong.set({});
    } catch {
      this.loi.set('Failed to parse the .ics file. Please check file format.');
    }
  }

  xuatIcs(): void {
    const t = this.title().trim() || (this.boardName() ? `${this.boardName()} meeting` : 'Meeting');
    const moc = this.mocThoiGian();
    const batDau = moc ? moc.batDau.toISOString() : new Date().toISOString();
    const ketThuc = moc
      ? moc.ketThuc.toISOString()
      : new Date(Date.now() + this.phutKeoDai() * 60_000).toISOString();

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
      },
    ]);

    taiVeFile(tenFileAnToan(t, 'ics'), icsContent, MIME_ICS);
  }

  xuatPdf(): void {
    window.print();
  }

  // ---------------------------------------------------------------- gửi

  private mocThoiGian(): { batDau: Date; ketThuc: Date } | null {
    if (!this.ngay() || !this.gio()) return null;
    const batDau = new Date(`${this.ngay()}T${this.gio()}`);
    if (Number.isNaN(batDau.getTime())) return null;
    return { batDau, ketThuc: new Date(batDau.getTime() + this.phutKeoDai() * 60_000) };
  }

  private kiemTra(): boolean {
    const loi: Record<string, string> = {};

    if (!this.title().trim()) loi['title'] = 'Give the meeting a title.';
    const moc = this.mocThoiGian();
    if (!moc) loi['time'] = 'Pick a valid date and time.';
    else if (moc.batDau.getTime() < Date.now()) {
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
function chuoiNgay(d: Date): string {
  return `${d.getFullYear()}-${hai(d.getMonth() + 1)}-${hai(d.getDate())}`;
}
function chuoiGio(d: Date): string {
  return `${hai(d.getHours())}:${hai(d.getMinutes())}`;
}
function laLinkMeet(v: string | null): boolean {
  return !!v && /^https:\/\/meet\.google\.com\/[A-Za-z0-9-]+$/.test(v);
}
