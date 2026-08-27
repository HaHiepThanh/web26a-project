import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideCheck,
  LucidePlus,
  LucideRotateCcw,
  LucideX,
} from '@lucide/angular';
import { FlipReorder } from '../../../directives/flip-reorder.directive';
import { LineRevealDirective } from '../../../directives/line-reveal.directive';
import { RevealDirective } from '../../../directives/reveal.directive';

export type TryLabel = 'blue' | 'purple' | 'green' | 'amber';

interface TryCheck {
  text: string;
  done: boolean;
}

/** Một thẻ trên bảng thử. `id` phải ổn định để FLIP nhận ra thẻ nào là thẻ nào. */
interface TryCard {
  id: string;
  title: string;
  col: number;
  label: TryLabel | null;
  /** Nhãn hạn dạng chữ. Cố ý KHÔNG dùng Date: bảng thử không cần lịch thật, mà
   *  một chuỗi thì lưu và khôi phục không bao giờ lệch múi giờ. */
  due: string | null;
  checks: TryCheck[];
}

/** Những gì được lưu lại. `dirty` là thứ chứng minh được bước ba — xem `restore`. */
interface Saved {
  cards: TryCard[];
  dirty: boolean;
  added: boolean;
  moved: boolean;
}

const STORAGE_KEY = 'hhh-try-board';

/**
 * Dấu "phiên này đã ghé rồi", sống trong sessionStorage nên tự mất khi đóng tab.
 *
 * Đây là thứ phân biệt TẢI LẠI TRANG với QUAY LẠI HÔM SAU. Chỉ dựa vào
 * localStorage thì cả hai đều giống nhau, và lời chào "welcome back" sẽ bật lên
 * ngay sau khi người ta vừa bấm F5 ở bước ba — vô duyên, và làm hỏng luôn cú
 * chốt của chính bước đó.
 */
const SESSION_KEY = 'hhh-try-seen';
const COLUMNS = ['To do', 'In progress', 'Done'];
const DUES = ['Today', 'Fri', 'Next week'];

/**
 * Bảng mẫu — CỐ Ý đã có sẵn nhãn, hạn và checklist.
 *
 * Bản trước mỗi thẻ chỉ là một dòng chữ trần, và nó âm thầm phản lại chính khu
 * "Everything in the box" ngay phía trên vừa hứa thẻ chứa được checklist, nhãn
 * màu, hạn. Khách nhìn vào thấy một tấm thẻ trống rỗng thì lời hứa kia mất giá
 * ngay. Thẻ mẫu phải TRÔNG đầy đặn từ giây đầu tiên.
 */
const SEED: TryCard[] = [
  {
    id: 's1',
    title: 'Write the launch email',
    col: 0,
    label: 'purple',
    due: 'Fri',
    checks: [
      { text: 'Draft the subject line', done: true },
      { text: 'Get Hoà to read it', done: false },
      { text: 'Schedule the send', done: false },
    ],
  },
  {
    id: 's2',
    title: 'Pick the demo dataset',
    col: 0,
    label: null,
    due: null,
    checks: [],
  },
  {
    id: 's3',
    title: 'Rehearse the walkthrough',
    col: 1,
    label: 'amber',
    due: 'Today',
    checks: [
      { text: 'Time the intro', done: true },
      { text: 'Cut slide 4', done: true },
      { text: 'Run it once end to end', done: false },
    ],
  },
  {
    id: 's4',
    title: 'Book the meeting room',
    col: 2,
    label: 'green',
    due: null,
    checks: [{ text: 'Confirm with reception', done: true }],
  },
];

/**
 * "Try it" — một tấm bảng CHẠY THẬT ngay trên trang giới thiệu.
 *
 * VÌ SAO PHẦN NÀY TỒN TẠI. Cả trang cho tới đây đều rất giỏi việc MÔ TẢ sản
 * phẩm, nhưng khách chưa hề dùng thứ gì. Mà lời hứa lớn nhất là "đơn giản tới
 * mức không cần học", và không câu chữ nào chứng minh được điều đó bằng việc để
 * người ta tự làm trong ba mươi giây.
 *
 * HAI THỨ KHIẾN NÓ KHÁC MỘT BẢN DEMO KANBAN THÔNG THƯỜNG:
 *
 *  1. THẺ CHỨA ĐƯỢC THỨ THẬT — checklist tick được, nhãn màu, hạn. Đây đúng là
 *     thứ khu "Everything in the box" vừa hứa; thiếu nó thì bản demo này đang
 *     chứng minh phần mà mọi Trello clone đều có, và không chứng minh phần khác
 *     biệt nào cả.
 *
 *  2. BA BƯỚC CÓ DẪN DẮT, mà bước cuối là "bấm F5 đi". Hero viết "Dragging is
 *     saving — there is no Save button", và cho tới giờ đó chỉ là một lời KHẲNG
 *     ĐỊNH. Bước ba biến nó thành thứ khách tự chứng minh cho chính họ. Một hộp
 *     cát không có dẫn dắt thì người ta kéo một thẻ rồi thôi, không biết phải
 *     chú ý điều gì.
 *
 * VÌ SAO KHÔNG DÙNG LẠI COMPONENT BẢNG CỦA APP: component đó buộc vào store và
 * backend — cần workspace, quyền, kết nối realtime. Kéo cả dây đó vào trang
 * giới thiệu là bắt khách tải hàng trăm kilobyte cho thứ họ chưa đăng nhập.
 */
@Component({
  selector: 'app-landing-try',
  imports: [
    RouterLink,
    FlipReorder,
    LineRevealDirective,
    RevealDirective,
    LucideArrowRight,
    LucideCheck,
    LucidePlus,
    LucideRotateCcw,
    LucideX,
  ],
  templateUrl: './landing-try.html',
  styleUrls: ['../_landing-shared.css', './landing-try.css'],
})
export class LandingTry {
  readonly columns = COLUMNS;
  readonly labels: TryLabel[] = ['blue', 'purple', 'green', 'amber'];
  readonly dues = DUES;

  readonly cards = signal<TryCard[]>(SEED);

  /** Thẻ đang mở bảng chi tiết (null = không mở). */
  readonly openCard = signal<string | null>(null);
  readonly composing = signal<number | null>(null);
  readonly dragging = signal<string | null>(null);

  /**
   * Cột mà thẻ đang kéo sẽ rơi vào — dùng để mở ô báo chỗ và làm sáng cột đích.
   * `null` khi không kéo, hoặc khi đang lơ lửng trên chính cột cũ của thẻ.
   */
  readonly dropCol = signal<number | null>(null);
  readonly announcement = signal('');

  // ---- Ba bước dẫn dắt -----------------------------------------------------
  readonly didAdd = signal(false);
  readonly didMove = signal(false);
  /** Đã tải lại trang và bảng vẫn còn — chỉ bật được ở `restore()`. */
  readonly didReload = signal(false);

  /**
   * Người này quay lại ở một PHIÊN MỚI và bảng cũ vẫn còn nguyên.
   *
   * Đây là lời chào duy nhất trên trang, và nó cố ý chỉ dành cho người quay
   * lại: khách lần đầu không thấy gì cả, nên không ai bị chặn đường. Với người
   * đã đi rồi mà trở lại thì nó là phần thưởng, không phải thuế — và nó chứng
   * minh lại lời hứa "không có nút Save" ở đúng thời điểm nặng ký nhất, tức là
   * sau một ngày chứ không phải sau năm giây.
   */
  readonly returning = signal(false);
  readonly allDone = computed(() => this.didAdd() && this.didMove() && this.didReload());

  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');
  private dragFrom = { x: 0, y: 0 };
  /**
   * Hộp của lưới, ĐO MỘT LẦN lúc bắt đầu kéo.
   * `getBoundingClientRect()` ép trình duyệt tính lại bố cục; gọi nó ở mỗi sự
   * kiện pointermove — tức mỗi khung hình trong suốt cú kéo — là tự tạo ra giật.
   */
  private dragBox: DOMRect | null = null;
  /**
   * Hộp của TỪNG cột, cũng đo một lần lúc bắt đầu kéo.
   *
   * Bản trước chia hộp lưới làm ba phần đều nhau và nó SAI ở khổ hẹp: dưới
   * 720px lưới chuyển sang cuộn ngang, nên hộp nhìn thấy chỉ chứa khoảng một
   * cột rưỡi trong khi phép chia vẫn tưởng có đủ ba. Đo được: kéo sang cột
   * "Done" ở khổ 375px thì hàm trả về null và thẻ không nhúc nhích.
   * Dò trúng hộp thật của từng cột thì đúng ở mọi khổ, và tiện thể tính luôn
   * cả phần đệm với khe giữa các cột.
   */
  private dragCols: DOMRect[] = [];
  private nextId = 100;
  private hydrated = false;

  constructor() {
    afterNextRender(() => {
      this.restore();
      this.hydrated = true;
    });

    effect(() => {
      const snapshot: Saved = {
        cards: this.cards(),
        dirty: this.didAdd() || this.didMove(),
        added: this.didAdd(),
        moved: this.didMove(),
      };
      // ĐỌC XONG MỚI GHI. Effect chạy ngay lần đầu, lúc `cards` còn là bảng mẫu
      // và `restore()` chưa kịp chạy (nó nằm trong afterNextRender). Không có cờ
      // này thì lần ghi đầu tiên đè bảng mẫu lên đúng cái bảng người dùng đã
      // dựng phiên trước — mất sạch, ngay trước khi khôi phục.
      if (!this.hydrated) return;
      this.persist(snapshot);
    });
  }

  cardsIn(col: number): TryCard[] {
    return this.cards().filter((c) => c.col === col);
  }

  card(id: string | null): TryCard | undefined {
    return id ? this.cards().find((c) => c.id === id) : undefined;
  }

  doneCount(card: TryCard): number {
    return card.checks.filter((c) => c.done).length;
  }

  // ==========================================================================
  //  Thêm / xoá / mở
  // ==========================================================================

  openComposer(col: number): void {
    this.composing.set(col);
  }

  closeComposer(): void {
    this.composing.set(null);
  }

  add(col: number, input: HTMLInputElement): void {
    const title = input.value.trim();
    if (!title) return;

    const id = `c${this.nextId++}`;
    this.cards.update((list) => [
      ...list,
      { id, title, col, label: null, due: null, checks: [] },
    ]);
    input.value = '';
    // Giữ ô nhập mở và giữ tiêu điểm: người ta hiếm khi thêm đúng một thẻ.
    input.focus();
    this.didAdd.set(true);
    this.announce(`Added “${title}” to ${COLUMNS[col]}.`);
  }

  remove(card: TryCard): void {
    this.cards.update((list) => list.filter((c) => c.id !== card.id));
    if (this.openCard() === card.id) this.openCard.set(null);
    this.announce(`Deleted “${card.title}”.`);
  }

  toggleOpen(card: TryCard): void {
    this.openCard.update((cur) => (cur === card.id ? null : card.id));
  }

  closeDetail(): void {
    this.openCard.set(null);
  }

  reset(): void {
    this.cards.set(SEED);
    this.openCard.set(null);
    this.didAdd.set(false);
    this.didMove.set(false);
    this.didReload.set(false);
    this.announce('Board reset.');
  }

  // ==========================================================================
  //  Nội dung thẻ
  // ==========================================================================

  private patch(id: string, change: Partial<TryCard>): void {
    this.cards.update((list) => list.map((c) => (c.id === id ? { ...c, ...change } : c)));
  }

  toggleCheck(card: TryCard, index: number): void {
    const checks = card.checks.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
    this.patch(card.id, { checks });
    const item = checks[index];
    this.announce(`${item.text} ${item.done ? 'checked' : 'unchecked'}.`);
  }

  addCheck(card: TryCard, input: HTMLInputElement): void {
    const text = input.value.trim();
    if (!text) return;
    this.patch(card.id, { checks: [...card.checks, { text, done: false }] });
    input.value = '';
    input.focus();
    this.announce(`Added checklist item “${text}”.`);
  }

  /** Bấm lại đúng nhãn đang chọn thì bỏ nhãn — không cần thêm một nút "xoá nhãn". */
  setLabel(card: TryCard, label: TryLabel): void {
    const next = card.label === label ? null : label;
    this.patch(card.id, { label: next });
    this.announce(next ? `Label set to ${next}.` : 'Label removed.');
  }

  setDue(card: TryCard, due: string): void {
    const next = card.due === due ? null : due;
    this.patch(card.id, { due: next });
    this.announce(next ? `Due ${next}.` : 'Due date removed.');
  }

  // ==========================================================================
  //  Dời thẻ
  // ==========================================================================

  moveTo(card: TryCard, col: number): void {
    const target = Math.max(0, Math.min(COLUMNS.length - 1, col));
    if (target === card.col) return;

    // ĐẨY XUỐNG CUỐI MẢNG, không chỉ đổi số cột.
    // `cardsIn()` lọc theo đúng thứ tự mảng gốc, nên chỉ đổi `col` tại chỗ thì
    // thẻ sẽ chen vào GIỮA cột đích theo vị trí cũ của nó — trong khi ô báo chỗ
    // lúc kéo lại nằm ở cuối cột. Ô báo chỗ mà chỉ sai một chỗ thôi là mất sạch
    // niềm tin vào cả cú kéo. Đưa xuống cuối thì chỗ nó rơi đúng bằng chỗ đã hứa.
    this.cards.update((list) => [
      ...list.filter((c) => c.id !== card.id),
      { ...card, col: target },
    ]);
    this.didMove.set(true);
    this.announce(`Moved “${card.title}” to ${COLUMNS[target]}.`);
  }

  onCardKeydown(card: TryCard, event: KeyboardEvent): void {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove(card);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleOpen(card);
      return;
    }
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    this.moveTo(card, card.col + step);
  }

  onPointerDown(card: TryCard, event: PointerEvent): void {
    if (event.button !== 0) return;
    // Bấm vào nút bên trong thẻ (xoá) thì để nút đó lo, đừng bắt đầu kéo.
    if ((event.target as HTMLElement).closest('button')) return;
    this.dragging.set(card.id);
    this.dragFrom = { x: event.clientX, y: event.clientY };
    const grid = this.grid()?.nativeElement;
    this.dragBox = grid?.getBoundingClientRect() ?? null;
    this.dragCols = grid
      ? [...grid.querySelectorAll('.tb-col')].map((c) => c.getBoundingClientRect())
      : [];
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onPointerMove(card: TryCard, event: PointerEvent): void {
    if (this.dragging() !== card.id) return;
    const el = event.currentTarget as HTMLElement;
    // Ghi thẳng vào custom property thay vì qua signal: giá trị đổi theo từng
    // pixel con trỏ, cho nó chạy qua change detection mỗi lần là phí.
    el.style.setProperty('--dx', `${event.clientX - this.dragFrom.x}px`);
    el.style.setProperty('--dy', `${event.clientY - this.dragFrom.y}px`);

    // Cột đích thì NGƯỢC LẠI phải đi qua signal: nó mở ô báo chỗ và làm sáng
    // cột, tức là có đổi giao diện. Nhưng chỉ ghi khi đổi cột — mỗi pixel một
    // lần dựng lại là vô ích.
    const next = this.colAt(event.clientX);
    if (next !== this.dropCol()) this.dropCol.set(next);
  }

  /**
   * Cột dưới toạ độ x, hoặc null nếu con trỏ đã ra ngoài lưới.
   *
   * Dò theo hộp thật của từng cột, KHÔNG chia đều hộp lưới — xem ghi chú ở
   * `dragCols`. Rơi vào khe giữa hai cột thì lấy cột có tâm gần nhất, chứ không
   * trả null: khe rộng chỉ 12px, mà tắt ô báo chỗ mỗi lần con trỏ lướt qua khe
   * thì nó nhấp nháy suốt cú kéo.
   */
  private colAt(clientX: number): number | null {
    const box = this.dragBox;
    if (!box || !this.dragCols.length) return null;
    if (clientX < box.left || clientX > box.right) return null;

    let best = 0;
    let bestGap = Infinity;
    this.dragCols.forEach((r, i) => {
      if (clientX >= r.left && clientX <= r.right) {
        best = i;
        bestGap = -1; // trúng hẳn trong cột — không cần so tiếp
        return;
      }
      if (bestGap === -1) return;
      const gap = Math.abs(clientX - (r.left + r.width / 2));
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    return best;
  }

  onPointerUp(card: TryCard, event: PointerEvent): void {
    if (this.dragging() !== card.id) return;
    const el = event.currentTarget as HTMLElement;
    el.style.removeProperty('--dx');
    el.style.removeProperty('--dy');
    this.dragging.set(null);

    const target = this.colAt(event.clientX);
    this.dropCol.set(null);
    this.dragBox = null;

    const moved =
      Math.abs(event.clientX - this.dragFrom.x) + Math.abs(event.clientY - this.dragFrom.y);
    // Nhấc lên đặt xuống gần như tại chỗ là một cú BẤM, không phải cú kéo — mở
    // chi tiết. Không có ngưỡng này thì con trỏ nhích một pixel lúc bấm cũng bị
    // tính là kéo, và thẻ không bao giờ mở được bằng chuột.
    if (moved < 6) {
      this.toggleOpen(card);
      return;
    }

    // Thả ra ngoài lưới thì thẻ về chỗ cũ — đúng như ô báo chỗ đã báo (lúc đó
    // nó cũng đã tắt).
    if (target === null) return;
    this.moveTo(card, target);
  }

  // ==========================================================================
  //  Lưu trữ
  // ==========================================================================

  /**
   * Đọc bảng đã lưu, và nhân tiện quyết định bước ba đã xong chưa.
   *
   * `dirty` là mấu chốt: nếu bản ghi cho biết người dùng ĐÃ tự sửa bảng ở phiên
   * trước, thì việc chúng ta đang khôi phục được nó ngay lúc này CHÍNH LÀ bằng
   * chứng "tải lại trang mà vẫn còn". Không cần đo đếm gì thêm.
   *
   * Bọc try/catch và kiểm tra kiểu từng trường: localStorage là dữ liệu NGƯỜI
   * DÙNG SỬA ĐƯỢC, và một chuỗi JSON hỏng sẽ ném lỗi ngay lúc dựng trang —
   * hỏng cả khu vực chỉ vì một bản ghi cũ sai định dạng.
   */
  private restore(): void {
    // Đánh dấu phiên TRƯỚC mọi lối thoát sớm, và nhớ lại nó có mới hay không.
    // Đặt sau các câu `return` bên dưới thì người chưa có bảng sẽ không bao giờ
    // được đánh dấu, và lần tải lại kế tiếp lại bị tính là "phiên mới".
    const freshSession = this.markSession();

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);

      // Bản ghi CŨ là một mảng thẻ trần, bản mới là object có thêm tiến độ.
      // Nhận cả hai, nếu không thì ai đã thử bảng trước lần cập nhật này sẽ mất
      // sạch những gì họ dựng.
      const list: unknown = Array.isArray(parsed) ? parsed : (parsed as Saved)?.cards;
      if (!Array.isArray(list)) return;

      const clean = list.filter(isTryCardish).map(normalise);
      if (!clean.length) return;

      this.cards.set(clean);
      // Khôi phục được bảng CỘNG VỚI phiên mới = đúng nghĩa "quay lại".
      if (freshSession) this.returning.set(true);

      const meta = Array.isArray(parsed) ? null : (parsed as Saved);
      if (meta?.added) this.didAdd.set(true);
      if (meta?.moved) this.didMove.set(true);
      if (meta?.dirty) this.didReload.set(true);

      // Đếm tiếp từ sau id lớn nhất đã lưu, không thì thẻ mới trùng id với thẻ
      // cũ và FLIP sẽ nhầm hai thẻ khác nhau là một.
      const max = clean.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 0);
      this.nextId = max + 1;
    } catch {
      // Bản ghi hỏng — bỏ qua, dùng bảng mẫu.
    }
  }

  /**
   * Đặt dấu phiên, trả về `true` nếu đây là phiên MỚI.
   *
   * Trình duyệt ở chế độ riêng tư có thể chặn sessionStorage và ném lỗi. Chặn
   * thì coi như KHÔNG phải phiên mới — thà không chào còn hơn chào nhầm người
   * vừa bấm F5 năm giây trước.
   */
  private markSession(): boolean {
    try {
      const seen = sessionStorage.getItem(SESSION_KEY);
      sessionStorage.setItem(SESSION_KEY, '1');
      return !seen;
    } catch {
      return false;
    }
  }

  private persist(saved: Saved): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Hết dung lượng, hoặc trình duyệt chặn lưu trữ ở chế độ riêng tư. Không
      // lưu được thì thôi — bảng vẫn nghịch được trong phiên này.
    }
  }

  /**
   * Thông báo cho trình đọc màn hình.
   *
   * Xoá rồi đặt lại ở nhịp sau: đặt cùng một chuỗi hai lần liên tiếp thì vùng
   * aria-live coi như không có gì đổi và im lặng — tick rồi bỏ tick cùng một
   * mục sẽ chỉ được đọc một lần.
   */
  private announce(message: string): void {
    this.announcement.set('');
    setTimeout(() => this.announcement.set(message));
  }
}

/** Đủ giống một tấm thẻ để nhận. Các trường mới thiếu thì `normalise` bù. */
function isTryCardish(value: unknown): value is Partial<TryCard> & { id: string; title: string } {
  const c = value as TryCard;
  return (
    !!c &&
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    Number.isInteger(c.col) &&
    c.col >= 0 &&
    c.col < COLUMNS.length
  );
}

/** Bù các trường mới cho bản ghi cũ, và vứt mọi thứ sai kiểu. */
function normalise(card: Partial<TryCard> & { id: string; title: string }): TryCard {
  const label = card.label;
  return {
    id: card.id,
    title: card.title,
    col: card.col ?? 0,
    label:
      label === 'blue' || label === 'purple' || label === 'green' || label === 'amber'
        ? label
        : null,
    due: typeof card.due === 'string' && DUES.includes(card.due) ? card.due : null,
    checks: Array.isArray(card.checks)
      ? card.checks
          .filter((c) => c && typeof c.text === 'string')
          .map((c) => ({ text: c.text, done: !!c.done }))
      : [],
  };
}
