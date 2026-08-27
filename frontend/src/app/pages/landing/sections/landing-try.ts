import {
  Component,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight, LucidePlus, LucideRotateCcw, LucideX } from '@lucide/angular';
import { FlipReorder } from '../../../directives/flip-reorder.directive';
import { LineRevealDirective } from '../../../directives/line-reveal.directive';
import { RevealDirective } from '../../../directives/reveal.directive';

/** Một thẻ trên bảng thử. `id` phải ổn định để FLIP nhận ra thẻ nào là thẻ nào. */
interface TryCard {
  id: string;
  title: string;
  col: number;
}

/** Khoá localStorage. Đặt tên có tiền tố để không đụng thứ gì khác của app. */
const STORAGE_KEY = 'hhh-try-board';

const COLUMNS = ['To do', 'In progress', 'Done'];

/** Bảng mẫu cho người mới vào — đủ để thấy hình dạng, còn chừa chỗ để tự thêm. */
const SEED: TryCard[] = [
  { id: 's1', title: 'Write the launch email', col: 0 },
  { id: 's2', title: 'Pick the demo dataset', col: 0 },
  { id: 's3', title: 'Rehearse the walkthrough', col: 1 },
  { id: 's4', title: 'Book the meeting room', col: 2 },
];

/**
 * "Try it" — một tấm bảng CHẠY THẬT ngay trên trang giới thiệu.
 *
 * VÌ SAO PHẦN NÀY TỒN TẠI. Cả trang cho tới đây đều rất giỏi việc MÔ TẢ sản
 * phẩm: bảng minh hoạ soi được, bốn tấm thẻ mở ra checklist, một cú kéo thả ở
 * hero. Nhưng tất cả đều là hình minh hoạ — khách chưa hề dùng thứ gì. Mà lời
 * hứa lớn nhất của sản phẩm này là "đơn giản tới mức không cần học", và không
 * câu chữ nào chứng minh được điều đó bằng việc để người ta tự làm trong ba
 * mươi giây.
 *
 * KHÔNG PHẢI MOCK. Thêm thẻ được, kéo được, xoá được, và trạng thái sống qua
 * lần tải trang sau. Đây là khác biệt căn bản so với bảng ở hero: hero cho đúng
 * MỘT động tác rồi đẩy người đọc đi tiếp (chủ ý, xem ghi chú ở landing-hero.ts);
 * còn chỗ này đặt sau khi họ đã xem hết tính năng và đang muốn thử.
 *
 * VÌ SAO KHÔNG DÙNG LẠI COMPONENT BẢNG CỦA APP: component đó buộc vào store và
 * backend — nó cần workspace, quyền, kết nối realtime. Kéo cả dây đó vào trang
 * giới thiệu là bắt khách tải hàng trăm kilobyte cho một thứ họ chưa đăng nhập.
 * Ở đây dựng lại phần tối thiểu, nhưng dáng thẻ bám sát thẻ thật để cái họ nghịch
 * đúng là cái họ sẽ gặp.
 */
@Component({
  selector: 'app-landing-try',
  imports: [
    RouterLink,
    FlipReorder,
    LineRevealDirective,
    RevealDirective,
    LucideArrowRight,
    LucidePlus,
    LucideRotateCcw,
    LucideX,
  ],
  templateUrl: './landing-try.html',
  styleUrls: ['../_landing-shared.css', './landing-try.css'],
})
export class LandingTry {
  readonly columns = COLUMNS;
  readonly cards = signal<TryCard[]>(SEED);

  /** Ô nhập đang mở ở cột nào (null = không cột nào). */
  readonly composing = signal<number | null>(null);

  /** Thẻ đang bị kéo. */
  readonly dragging = signal<string | null>(null);

  /** Câu thông báo cho trình đọc màn hình sau mỗi thao tác. */
  readonly announcement = signal('');

  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');
  private readonly host = inject(ElementRef<HTMLElement>);
  private dragFrom = { x: 0, y: 0 };
  private nextId = 100;
  /** Chỉ ghi vào localStorage sau khi đã đọc xong — xem ghi chú ở constructor. */
  private hydrated = false;

  constructor() {
    afterNextRender(() => {
      this.restore();
      this.hydrated = true;
    });

    effect(() => {
      const cards = this.cards();
      // ĐỌC XONG MỚI GHI. Effect chạy ngay lần đầu, lúc `cards` còn là bảng mẫu
      // và `restore()` chưa kịp chạy (nó nằm trong afterNextRender). Không có cờ
      // này thì lần ghi đầu tiên đè bảng mẫu lên đúng cái bảng người dùng đã
      // dựng phiên trước — mất sạch, ngay trước khi khôi phục.
      if (!this.hydrated) return;
      this.persist(cards);
    });
  }

  cardsIn(col: number): TryCard[] {
    return this.cards().filter((c) => c.col === col);
  }

  // ==========================================================================
  //  Thêm / xoá
  // ==========================================================================

  openComposer(col: number): void {
    this.composing.set(col);
  }

  closeComposer(): void {
    this.composing.set(null);
  }

  /** Thêm thẻ. Chuỗi rỗng thì bỏ qua chứ không tạo thẻ trắng. */
  add(col: number, input: HTMLInputElement): void {
    const title = input.value.trim();
    if (!title) return;

    this.cards.update((list) => [...list, { id: `c${this.nextId++}`, title, col }]);
    input.value = '';
    // Giữ ô nhập mở và giữ tiêu điểm: người ta hiếm khi thêm đúng một thẻ, và
    // bắt bấm lại nút "Add" sau mỗi thẻ là chỗ khó chịu kinh điển.
    input.focus();
    this.announce(`Added “${title}” to ${COLUMNS[col]}.`);
  }

  remove(card: TryCard): void {
    this.cards.update((list) => list.filter((c) => c.id !== card.id));
    this.announce(`Deleted “${card.title}”.`);
  }

  reset(): void {
    this.cards.set(SEED);
    this.announce('Board reset.');
  }

  // ==========================================================================
  //  Dời thẻ
  // ==========================================================================

  /** Dời sang cột bên cạnh. Dùng cho cả bàn phím lẫn cú thả chuột. */
  moveTo(card: TryCard, col: number): void {
    const target = Math.max(0, Math.min(COLUMNS.length - 1, col));
    if (target === card.col) return;
    this.cards.update((list) =>
      list.map((c) => (c.id === card.id ? { ...c, col: target } : c)),
    );
    this.announce(`Moved “${card.title}” to ${COLUMNS[target]}.`);
  }

  /**
   * Bàn phím: mũi tên trái/phải dời thẻ sang cột bên cạnh.
   *
   * Không làm kiểu "bấm để nhấc, bấm lần nữa để thả": với ba cột thì thêm một
   * trạng thái trung gian chỉ tổ rối, mà lại là trạng thái vô hình với người
   * dùng bàn phím.
   */
  onCardKeydown(card: TryCard, event: KeyboardEvent): void {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove(card);
      return;
    }
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    this.moveTo(card, card.col + step);
  }

  onPointerDown(card: TryCard, event: PointerEvent): void {
    if (event.button !== 0) return;
    this.dragging.set(card.id);
    this.dragFrom = { x: event.clientX, y: event.clientY };
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
  }

  onPointerUp(card: TryCard, event: PointerEvent): void {
    if (this.dragging() !== card.id) return;
    const el = event.currentTarget as HTMLElement;
    el.style.removeProperty('--dx');
    el.style.removeProperty('--dy');
    this.dragging.set(null);

    const box = this.grid()?.nativeElement.getBoundingClientRect();
    if (!box) return;
    // Chia lưới làm ba phần đều nhau theo bề ngang. Thô hơn việc đo từng cột,
    // nhưng đúng thứ người dùng cảm thấy: thả vào vùng nào thì rơi vào cột đó.
    const col = Math.floor(((event.clientX - box.left) / box.width) * COLUMNS.length);
    this.moveTo(card, col);
  }

  // ==========================================================================
  //  Lưu trữ
  // ==========================================================================

  /**
   * Đọc bảng đã lưu.
   *
   * Bọc try/catch và kiểm tra kiểu từng trường: localStorage là dữ liệu NGƯỜI
   * DÙNG SỬA ĐƯỢC, và một chuỗi JSON hỏng ở đây sẽ ném lỗi ngay lúc dựng trang
   * — hỏng cả khu vực chỉ vì một bản ghi cũ sai định dạng. Hỏng thì lặng lẽ
   * quay về bảng mẫu.
   */
  private restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const clean = parsed.filter(
        (c): c is TryCard =>
          !!c &&
          typeof (c as TryCard).id === 'string' &&
          typeof (c as TryCard).title === 'string' &&
          Number.isInteger((c as TryCard).col) &&
          (c as TryCard).col >= 0 &&
          (c as TryCard).col < COLUMNS.length,
      );
      if (!clean.length) return;

      this.cards.set(clean);
      // Tiếp tục đánh số từ sau id lớn nhất đã lưu, không thì thẻ mới trùng id
      // với thẻ cũ và FLIP sẽ nhầm hai thẻ khác nhau là một.
      const max = clean.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 0);
      this.nextId = max + 1;
    } catch {
      // Bản ghi hỏng — bỏ qua, dùng bảng mẫu.
    }
  }

  private persist(cards: TryCard[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    } catch {
      // Hết dung lượng, hoặc trình duyệt chặn lưu trữ ở chế độ riêng tư. Không
      // lưu được thì thôi — bảng vẫn nghịch được trong phiên này.
    }
  }

  /**
   * Thông báo cho trình đọc màn hình.
   *
   * Xoá rồi đặt lại ở nhịp sau: đặt cùng một chuỗi hai lần liên tiếp thì vùng
   * aria-live coi như không có gì đổi và im lặng — dời hai thẻ giống nhau liên
   * tiếp sẽ chỉ được đọc một lần.
   */
  private announce(message: string): void {
    this.announcement.set('');
    setTimeout(() => this.announcement.set(message));
  }
}
