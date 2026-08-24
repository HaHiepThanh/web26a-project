import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  signal,
  viewChildren,
} from '@angular/core';
import { LucideColumns3, LucideMessageSquare, LucideSparkles, LucideTag } from '@lucide/angular';
import { RevealDirective } from '../../../directives/reveal.directive';
import { ScrambleInDirective } from '../../../directives/scramble-in.directive';

/**
 * Kể chuyện bằng cuộn: mockup bảng bị ghim (position: sticky) bên trái trong khi
 * bốn mục mô tả trôi qua bên phải. Mục nào đang ở giữa màn hình thì phần tương
 * ứng trên mockup sáng lên.
 *
 * Không có thư viện scroll nào ở đây, và cũng không có "scroll-jacking" — trang
 * vẫn cuộn đúng tốc độ người dùng quen. Toàn bộ cơ chế là `position: sticky` cho
 * phần ghim, cộng một IntersectionObserver để biết mục nào đang được đọc.
 *
 * Mẹo ở chỗ rootMargin '-45% 0px -45% 0px': nó bóp vùng quan sát lại thành một
 * dải ngang mỏng ngay giữa màn hình, nên tại mỗi thời điểm gần như chỉ có đúng
 * một mục "đang giao nhau". Nếu để nguyên khung nhìn thì cả bốn mục cùng thoả
 * và không biết chọn cái nào.
 */
@Component({
  selector: 'app-landing-story',
  imports: [
    RevealDirective,
    ScrambleInDirective,
    LucideColumns3,
    LucideMessageSquare,
    LucideSparkles,
    LucideTag,
  ],
  templateUrl: './landing-story.html',
  styleUrls: ['../_landing-shared.css', './landing-story.css'],
})
export class LandingStory implements OnDestroy {
  readonly steps = [
    {
      icon: 'columns' as const,
      title: 'Columns shaped the way your team works',
      desc: 'Add, rename and reorder columns by dragging. No template process gets imposed on you.',
    },
    {
      icon: 'card' as const,
      title: 'Every card holds the whole context',
      desc: 'Description, checklist, comments, owner, attachments — open the card and you know enough, without digging through chat.',
    },
    {
      icon: 'tag' as const,
      title: 'Labels and dates you read at a glance',
      desc: 'Label colour says which area the work belongs to; the due badge changes colour as the date closes in.',
    },
    {
      icon: 'chat' as const,
      title: 'The conversation sits beside the board',
      desc: 'Discussion happens in the right-hand panel — and that panel is where the assistant picks the work out to offer it to you.',
    },
  ];

  /** Mục đang được đọc — cũng là phần đang sáng trên mockup. */
  readonly active = signal(0);

  private readonly stepEls = viewChildren<ElementRef<HTMLElement>>('step');
  private observer?: IntersectionObserver;

  constructor() {
    // afterNextRender: chỉ chạy trên trình duyệt và chắc chắn DOM đã có thật.
    afterNextRender(() => {
      // Cố ý KHÔNG kiểm tra prefers-reduced-motion ở đây: phần sáng trên mockup
      // là thông tin ("bạn đang đọc mục này"), không phải hoạt ảnh trang trí.
      // Người bật giảm chuyển động vẫn cần nó, chỉ là chuyển màu không có hiệu
      // ứng mượt — việc đó CSS đã lo ở cuối landing-story.css.
      if (typeof IntersectionObserver === 'undefined') return;

      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const index = Number((entry.target as HTMLElement).dataset['index']);
            if (!Number.isNaN(index)) this.active.set(index);
          }
        },
        // Chỉ còn một dải mỏng 10% ở giữa màn hình được tính là "đang xem".
        { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
      );

      // KHÔNG unobserve sau lần đầu: khác với hiệu ứng hiện-một-lần, phần này
      // phải theo dõi suốt vì người dùng cuộn lên cuộn xuống bao nhiêu lần cũng
      // được. Observer được ngắt trong ngOnDestroy.
      for (const ref of this.stepEls()) this.observer.observe(ref.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
