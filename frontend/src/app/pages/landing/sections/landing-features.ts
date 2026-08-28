import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  signal,
  viewChildren,
} from '@angular/core';
import {
  LucideCalendarClock,
  LucideColumns3,
  LucideMessageSquare,
  LucideSquareKanban,
  LucideTag,
} from '@lucide/angular';
import { LineRevealDirective } from '../../../directives/line-reveal.directive';
import { RevealDirective } from '../../../directives/reveal.directive';

/** Một vùng có thể soi trên bảng minh hoạ. */
type Region = 'columns' | 'card' | 'labels' | 'due' | 'chat';

interface Feature {
  region: Region;
  icon: 'columns' | 'card' | 'tag' | 'due' | 'chat';
  title: string;
  desc: string;
}

/**
 * Khu tính năng — MỘT tấm bảng soi được, thay cho lưới tám thẻ trước đây.
 *
 * Lưới thẻ kể cho người đọc nghe app làm được gì. Tấm bảng này CHO HỌ XEM: chọn
 * một mục bên trái thì đúng chỗ tương ứng trên bảng sáng lên, phần còn lại mờ
 * đi. Người đọc học được chức năng nằm ở đâu trên màn hình thật, chứ không chỉ
 * đọc tên nó.
 *
 * Ba quyết định đáng ghi lại:
 *
 * 1. CUỘN TỚI ĐÂU, SOI TỚI ĐÓ — mà bấm vẫn bấm được.
 *    Mục nào trôi vào giữa màn hình thì tự được chọn, nên người chỉ cuộn cũng
 *    xem được hết mà không phải bấm gì. Bấm thì vẫn nhảy tới ngay, nhưng cú bấm
 *    CÒN KÉO LUÔN mục đó vào giữa màn hình — nếu không, lần cuộn kế tiếp sẽ đưa
 *    vùng quan sát về mục cũ và giật lựa chọn khỏi tay người dùng.
 *
 *    Khu vực này thay luôn cho một khu riêng trước đây ("Scroll on — the board
 *    explains itself"): khu đó cũng là bảng ghim + các bước cuộn qua, và bốn
 *    bước của nó là tập con của năm mục ở đây. Hai lần kể cùng một chuyện bằng
 *    cùng một hình thì lần thứ hai chỉ làm loãng.
 *
 * 2. DÙNG KHUÔN TAB CHUẨN (`tablist`/`tab`/`tabpanel`). Năm mục là năm lựa chọn
 *    loại trừ nhau điều khiển cùng một vùng hiển thị — đúng định nghĩa của tab.
 *    Được kèm luôn: mũi tên trái/phải chuyển mục, Home/End nhảy đầu cuối, và
 *    trình đọc màn hình đọc ra "tab 3 trên 5" mà không phải tự chế gì.
 *
 * 3. KHÔNG GIẤU NỘI DUNG. Cả năm mục cùng mô tả của chúng luôn hiện đủ trong
 *    danh sách bên trái; chọn chỉ đổi chỗ được soi trên bảng. Người lướt nhanh
 *    vẫn đọc được hết mà không phải bấm cái nào — khác hẳn kiểu tab thường,
 *    nơi bốn phần năm nội dung bị giấu đi.
 */
@Component({
  selector: 'app-landing-features',
  imports: [
    LineRevealDirective, RevealDirective,
    LucideCalendarClock,
    LucideColumns3,
    LucideMessageSquare,
    LucideSquareKanban,
    LucideTag,
  ],
  templateUrl: './landing-features.html',
  styleUrls: ['../_landing-shared.css', './landing-features.css'],
})
export class LandingFeatures implements OnDestroy {
  readonly features: readonly Feature[] = [
    {
      region: 'columns',
      icon: 'columns',
      title: 'Columns you shape',
      desc: 'Add, rename and drag columns into the order your team actually works in. No template process gets imposed on you.',
    },
    {
      region: 'card',
      icon: 'card',
      title: 'Cards that hold the context',
      desc: 'Description, checklist, comments, attachments and an owner. Open one card and you know enough to act.',
    },
    {
      region: 'labels',
      icon: 'tag',
      title: 'Labels and priority',
      desc: 'Colour by area, flag what is urgent, then filter the whole board down to it in one click.',
    },
    {
      region: 'due',
      icon: 'due',
      title: 'Dates that warn you',
      desc: 'The badge turns red the moment a card is overdue, and it comes looking for you in the notification bell too.',
    },
    {
      region: 'chat',
      icon: 'chat',
      title: 'Chat, and the assistant',
      desc: 'Talk it over beside the board. The assistant spots the work in the thread and offers you a card.',
    },
  ];

  readonly active = signal(0);

  private readonly tabEls = viewChildren<ElementRef<HTMLElement>>('tab');
  private observer?: IntersectionObserver;

  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;

      // Cố ý KHÔNG kiểm tra prefers-reduced-motion ở đây: phần được soi trên
      // bảng là THÔNG TIN ("bạn đang đọc mục này"), không phải hoạt ảnh trang
      // trí. Người bật giảm chuyển động vẫn cần nó — chỉ là phần chuyển màu
      // không có hiệu ứng mượt, việc đó CSS đã lo ở cuối landing-features.css.
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const i = Number((e.target as HTMLElement).dataset['index']);
            if (!Number.isNaN(i)) this.active.set(i);
          }
        },
        // Bóp vùng quan sát thành một dải mỏng 10% ngay giữa màn hình, nên mỗi
        // lúc gần như chỉ có đúng một mục "đang được đọc". Để nguyên khung nhìn
        // thì cả năm mục cùng thoả điều kiện và không biết chọn cái nào.
        { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
      );

      // KHÔNG unobserve sau lần đầu: khác hiệu ứng hiện-một-lần, cái này phải
      // theo dõi suốt vì người dùng cuộn lên cuộn xuống bao nhiêu lần cũng được.
      for (const ref of this.tabEls()) this.observer.observe(ref.nativeElement);
    });
  }

  /**
   * Chọn một mục bằng cách bấm.
   *
   * Sau khi đặt mục, còn phải KÉO NÓ VÀO GIỮA MÀN HÌNH. Không có bước đó thì cú
   * bấm chỉ sống được tới lần cuộn kế tiếp: vùng quan sát vẫn đang nằm ở mục cũ
   * nên nó lập tức giành lại lựa chọn, và người dùng thấy thứ mình vừa bấm bị
   * nhảy về chỗ khác.
   */
  select(index: number): void {
    this.active.set(index);
    const el = this.tabEls()[index]?.nativeElement;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }

  /**
   * Điều hướng bằng bàn phím theo đúng khuôn tab: mũi tên chuyển mục, Home/End
   * nhảy về đầu/cuối. Chuyển tới đâu thì đưa luôn tiêu điểm tới đó, vì với khuôn
   * tab "tự kích hoạt" thì mục đang chọn và mục đang có tiêu điểm phải là một.
   */
  onKeydown(event: KeyboardEvent): void {
    const last = this.features.length - 1;
    const current = this.active();
    let next: number | null = null;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = current === last ? 0 : current + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = current === 0 ? last : current - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;

    event.preventDefault();
    this.select(next);
    const el = document.getElementById(`feat-tab-${next}`);
    el?.focus();
  }

  /** Vùng nào đang được soi — dùng để bật lớp sáng trên đúng phần của bảng. */
  isLit(region: Region): boolean {
    return this.features[this.active()].region === region;
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
