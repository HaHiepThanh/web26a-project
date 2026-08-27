import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { UpcomingMeeting } from '../models';
import { AuthService } from './auth.service';
import { MeetingsService } from './meetings.service';
import { NotificationService } from './notification.service';
import { RealtimeService } from './realtime.service';

/**
 * Bao lâu hỏi lại danh sách một lần.
 *
 * Chỉ để BẮT THAY ĐỔI (ai đó vừa hẹn thêm, vừa huỷ), chứ không phải để canh
 * giờ — canh giờ là việc của hẹn giờ cục bộ bên dưới. Vì thế 5 phút là thoải
 * mái, và những thay đổi gấp hơn thế đã có sự kiện realtime kéo về ngay.
 */
const CHU_KY_MS = 5 * 60 * 1000;

/**
 * Đã qua giờ nhắc bao lâu thì thôi không nhắc nữa.
 *
 * Backend trả về cả cuộc vừa qua mốc nhắc để người mới mở máy không bị lỡ. Nhưng
 * nhắc một cuộc đã bắt đầu từ lâu thì vô nghĩa, nên chặn ở đây.
 */
const TRE_TOI_DA_MS = 10 * 60 * 1000;

/**
 * NHẮC TRƯỚC GIỜ HỌP qua chuông 🔔.
 *
 * ─── VÌ SAO PHẢI TỰ ĐẾM GIỜ, KHÔNG DÙNG NHẮC CỦA GOOGLE ───
 *
 * Nhắc của Google (`reminders.overrides`) chạy TRONG hệ thống Google: nó bật
 * popup trong Google Calendar và gửi mail. Nó KHÔNG gọi về server mình. Cơ chế
 * đẩy duy nhất Google có là `events.watch`, và cái đó chỉ bắn khi sự kiện BỊ
 * SỬA — không bắn khi tới giờ nhắc. Nên muốn chuông trong app kêu thì phải tự
 * giữ lịch mà đếm.
 *
 * (Người dùng vẫn nhận được nhắc của Google song song — hai đường không loại
 * trừ nhau, và mail của Google còn tới được cả khi họ không mở app.)
 *
 * ─── VÌ SAO KHÔNG DÙNG WEBSOCKET ───
 *
 * Cùng lý do với `OverdueWatcherService`: "sắp tới giờ họp" không phải hành
 * động của ai cả, nó xảy ra do thời gian trôi qua. Không có sự kiện nào để mà
 * phát. Nên đây là hỏi-rồi-tự-hẹn-giờ, không phải nghe.
 *
 * ─── VÌ SAO HỎI ĐỊNH KỲ RỒI CÒN ĐẶT HẸN GIỜ RIÊNG ───
 *
 * Nếu chỉ hỏi định kỳ rồi nhắc luôn thì độ chính xác không thể hơn nhịp hỏi:
 * hỏi 5 phút/lần thì lời nhắc "trước 10 phút" có thể tới lúc chỉ còn 5 phút.
 * Nên: hỏi để BIẾT lịch, rồi đặt `setTimeout` đúng mốc để NHẮC.
 *
 * ⚠️ Mốc nhắc tính theo ĐỒNG HỒ MÁY người dùng. Máy lệch giờ thì lời nhắc lệch
 *    theo — không sửa được từ phía này, và cũng không đáng đánh đổi thêm gì để
 *    sửa, vì mọi thứ khác họ nhìn thấy đều đã theo đồng hồ đó rồi.
 */
@Injectable({ providedIn: 'root' })
export class MeetingReminderService {
  private readonly meetings = inject(MeetingsService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly realtime = inject(RealtimeService);

  private timer: ReturnType<typeof setInterval> | null = null;
  /** Hẹn giờ đang chờ, theo id cuộc họp — để huỷ được khi cuộc họp bị huỷ. */
  private readonly hen = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * Cuộc họp đã nhắc trong PHIÊN này.
   *
   * Không có nó thì một cuộc đã qua mốc nhắc sẽ được nhắc lại ở MỌI nhịp hỏi
   * suốt cửa sổ `TRE_TOI_DA_MS` — cứ 5 phút một lần. Người dùng thật ra không
   * thấy gì (id của `addMeetingReminder` cố định nên `NotificationService` chặn
   * trùng), nhưng dựa vào chỗ khác dọn hộ thì hành vi của service này tự nó là
   * sai, và log thì đầy những lần gọi thừa.
   *
   * ⚠️ Vẫn PHẢI giữ cả hai lớp: tập này mất khi tải lại trang, còn phép chặn
   *    trùng theo id ở `NotificationService` thì sống trong localStorage — đó
   *    mới là thứ giữ cho F5 không nhắc lại.
   */
  private readonly daNhac = new Set<string>();
  private boHuyNghe: (() => void)[] = [];

  constructor() {
    effect(() => {
      if (this.auth.isLoggedIn()) this.start();
      else this.stop();
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private start(): void {
    if (this.timer) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), CHU_KY_MS);

    // Có người vừa hẹn/huỷ một cuộc họp có mình → nạp lại NGAY, không chờ hết
    // chu kỳ. Quan trọng với cuộc họp hẹn gấp: hẹn lúc 9:00 cho 9:05 mà phải
    // chờ tới nhịp hỏi kế tiếp thì lời nhắc tới muộn hoặc không kịp tới.
    this.boHuyNghe = [
      this.realtime.onUserEvent('meeting.scheduled', () => void this.check()),
      this.realtime.onUserEvent('meeting.canceled', () => void this.check()),
    ];
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const t of this.hen.values()) clearTimeout(t);
    this.hen.clear();
    this.daNhac.clear();
    for (const bo of this.boHuyNghe) bo();
    this.boHuyNghe = [];
  }

  /** Hỏi server rồi xếp lại toàn bộ hẹn giờ. */
  async check(): Promise<void> {
    let ds: UpcomingMeeting[];
    try {
      ds = await this.meetings.sapToiCuaToi();
    } catch {
      // Mất mạng hoặc token vừa hết hạn — im lặng bỏ qua, lần hẹn sau hỏi lại.
      // Nhắc họp không đáng để đẩy một dải báo lỗi lên màn hình người dùng.
      return;
    }

    // Cuộc nào không còn trong danh sách (bị huỷ, hoặc đã trôi qua) thì bỏ hẹn.
    // Không dọn thì một cuộc đã huỷ vẫn nhắc vì hẹn giờ cũ còn nằm đó.
    const conLai = new Set(ds.map((m) => m.id));
    for (const [id, t] of this.hen) {
      if (!conLai.has(id)) {
        clearTimeout(t);
        this.hen.delete(id);
      }
    }

    for (const m of ds) this.xepMotCuoc(m);
  }

  private xepMotCuoc(m: UpcomingMeeting): void {
    if (m.remindMinutes <= 0) return; // người tạo chọn không nhắc
    if (this.daNhac.has(m.id)) return; // phiên này nhắc rồi

    const batDau = new Date(m.startAt).getTime();
    if (Number.isNaN(batDau)) return;

    const mocNhac = batDau - m.remindMinutes * 60_000;
    const conBaoLau = mocNhac - Date.now();

    if (conBaoLau <= 0) {
      // Đã qua mốc nhắc. Nhắc ngay — trừ khi trễ quá lâu thì thôi.
      // `addMeetingReminder` khoá trùng theo id cuộc họp nên gọi lại ở mỗi nhịp
      // hỏi cũng chỉ ra ĐÚNG MỘT thông báo; chỗ này không phải tự nhớ đã nhắc gì.
      if (Date.now() - mocNhac <= TRE_TOI_DA_MS) this.nhac(m);
      return;
    }

    // Đã có hẹn cho cuộc này rồi thì thôi — đặt chồng là hai lần nhắc (dù
    // `add()` chống trùng, vẫn phí và vẫn rối khi đọc log).
    if (this.hen.has(m.id)) return;

    this.hen.set(
      m.id,
      setTimeout(() => {
        this.hen.delete(m.id);
        this.nhac(m);
      }, conBaoLau),
    );
  }

  /**
   * Nhắc MỘT LẦN cho mỗi cuộc họp trong phiên này.
   *
   * ⚠️ Chốt chặn phải nằm ở ĐÂY chứ không chỉ ở `xepMotCuoc`. Có hai đường tới
   *    được hàm này — nhịp hỏi định kỳ và hẹn giờ — và chúng có thể rơi đúng
   *    cùng một mốc: nhịp hỏi thấy `conBaoLau <= 0` nên nhắc ngay, rồi hẹn giờ
   *    của chính cuộc đó nổ ngay sau và nhắc lần nữa. Đặt chốt ở nơi gọi thì
   *    phải nhớ đặt ở cả hai; đặt tại đây thì không có đường nào lách được.
   */
  private nhac(m: UpcomingMeeting): void {
    if (this.daNhac.has(m.id)) return;
    this.daNhac.add(m.id);
    this.notifications.addMeetingReminder({
      id: m.id,
      boardId: m.boardId,
      boardName: m.boardName,
      orgSlug: m.orgSlug,
      title: m.title,
      startAt: m.startAt,
    });
  }
}
