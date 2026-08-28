import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { LucideLayoutGrid, LucideRadio, LucideSettings2, LucideUsers, LucideX } from '@lucide/angular';
import { LineRevealDirective } from '../../../directives/line-reveal.directive';
import { ScrollSkewDirective } from '../../../directives/scroll-skew.directive';
import { RevealDirective } from '../../../directives/reveal.directive';

/**
 * "Everything in the box" — bốn tấm THẺ, bấm vào thì mở ra chi tiết.
 *
 * VÌ SAO LÀ THẺ (sau khi đã thử cái cây rồi tới cái tủ ngăn kéo):
 * Cả hai thứ kia đều là ẩn dụ mượn từ bên ngoài — người đọc phải học "cái tủ này
 * tượng trưng cho cái gì" trước khi hiểu được nội dung. Còn sản phẩm này VỐN LÀM
 * BẰNG THẺ. Lấy thẻ làm vật chứa thì không còn là ẩn dụ nữa, nó là chính ngôn
 * ngữ của app.
 *
 * Và cú bấm dạy luôn thao tác thật: trong app, bấm một tấm thẻ thì chi tiết mở
 * ra kèm checklist. Ở đây cũng vậy — ba mươi tính năng hiện ra đúng dạng
 * checklist. Người đọc vừa xem tính năng vừa học được cách dùng, bằng cùng một
 * động tác.
 *
 * MỘT THẺ MỞ MỖI LÚC. Giống hệt app thật: mở một thẻ khác thì thẻ đang mở đóng
 * lại. Cho mở nhiều cùng lúc thì lưới vỡ nát và mất luôn cảm giác "đang xem chi
 * tiết MỘT thẻ".
 *
 * ⚠️ Mọi mục đã đối chiếu với code thật. Trang giới thiệu hứa một tính năng chưa
 * tồn tại là nói dối người dùng.
 */
@Component({
  selector: 'app-landing-capabilities',
  imports: [
    LineRevealDirective,
    ScrollSkewDirective,
    RevealDirective,
    LucideLayoutGrid,
    LucideRadio,
    LucideSettings2,
    LucideUsers,
    LucideX,
  ],
  templateUrl: './landing-capabilities.html',
  styleUrls: ['../_landing-shared.css', './landing-capabilities.css'],
})
export class LandingCapabilities {
  readonly groups = [
    {
      icon: 'board' as const,
      tone: 'blue' as const,
      title: 'Boards and cards',
      blurb: 'The part you touch all day.',
      /** Ba mục tiêu biểu, hiện sẵn trên mặt thẻ khi chưa mở. */
      peek: ['Drag between columns', 'Checklists', 'Colour labels'],
      items: [
        'Add, rename and reorder columns',
        'Drag cards between columns',
        'Description, checklist and a done toggle',
        'Colour labels you name yourself',
        'Priority: high, medium or low',
        'Due dates that warn as they near',
        'Comments with avatars and history',
        'Attachments, with image covers',
        'Filter and sort without losing your place',
        'Pick several cards and move or label them at once',
        'Collapse a column you are not using',
        'Board backgrounds, colour or image',
        'A minimap for wide boards',
      ],
    },
    {
      icon: 'team' as const,
      tone: 'purple' as const,
      title: 'Team and access',
      blurb: 'Who is in, and what they may do.',
      peek: ['Google or password', 'Three roles', 'Invite links'],
      items: [
        'Sign in with Google, or with an email and password',
        'Forgot your password? Reset it by email',
        'Change your password from settings',
        'Organizations with a URL of their own',
        'Invitations by email, or one link anyone can join with',
        'Three roles: owner, admin, member',
        'Workspaces per team or department',
        'Change or revoke a member’s role',
        'Permissions enforced on the server',
      ],
    },
    {
      icon: 'sync' as const,
      tone: 'green' as const,
      title: 'Staying in sync',
      blurb: 'Knowing what changed, without asking.',
      peek: ['Live updates', 'Board chat', 'Meetings'],
      items: [
        'Live updates as teammates move cards',
        'Activity log in plain sentences',
        'Chat beside every board',
        'Schedule board meetings, with Google Calendar and Meet',
        'An assistant that turns chat into card suggestions',
        'Overdue and due-soon reminders',
        'Search your boards from the header',
        'Workspace statistics',
      ],
    },
    {
      icon: 'comfort' as const,
      tone: 'amber' as const,
      title: 'Comfort and care',
      blurb: 'The parts you only notice when missing.',
      peek: ['Light and dark', 'Guided tour', 'Works on phones'],
      items: [
        'A guided tour on your first visit',
        'Light and dark themes, remembered',
        'An offline notice, and recovery when you return',
        'Phone and tablet layouts, with an action bar at your thumb',
        'Display name and avatar, updating live',
        'Keyboard and screen-reader support',
      ],
    },
  ];

  readonly total = this.groups.reduce((sum, g) => sum + g.items.length, 0);

  /** Thẻ đang mở, hoặc null khi cả bốn đều đóng. */
  readonly open = signal<number | null>(null);

  private readonly cardEls = viewChildren<ElementRef<HTMLElement>>('card');
  private readonly injector = inject(Injector);

  /** Bấm một thẻ: mở nó ra, hoặc đóng lại nếu nó đang mở. */
  toggle(index: number): void {
    this.transition(() => this.open.update((cur) => (cur === index ? null : index)));
  }

  /**
   * Chạy một thay đổi trạng thái qua View Transitions API.
   *
   * Vì sao đáng dùng ở ĐÚNG chỗ này: thẻ mở ra là một cú đổi bố cục thật — nó
   * nhảy từ một ô lưới hẹp sang chiếm trọn bề ngang, ba thẻ kia co lại và đổi
   * chỗ. Bằng CSS thuần thì không có cách nào nối hai bố cục đó lại, vì phần tử
   * đổi ô lưới chứ không đổi transform; kết quả là nó biến mất chỗ này rồi hiện
   * ra chỗ kia. View Transitions cho trình duyệt chụp trước–sau rồi tự nội suy,
   * nên tấm thẻ NỞ RA đúng nghĩa thay vì nhảy cóc.
   *
   * ⚠️ TRẢ VỀ PROMISE, đừng đổi trạng thái rồi thoát ngay.
   * Trình duyệt chụp ảnh "sau" tại thời điểm callback kết thúc. Mà ghi một
   * signal của Angular chỉ ĐẶT LỊCH cho một vòng phát hiện thay đổi chạy sau,
   * nên callback đồng bộ sẽ kết thúc lúc DOM còn y nguyên — hoạt ảnh chạy giữa
   * hai khung hình giống hệt nhau, tức là không thấy gì cả.
   *
   * Đã thử `ChangeDetectorRef.detectChanges()` ngay trong callback và ĐO RA LÀ
   * KHÔNG ĂN: sau khi callback chạy xong vẫn không có `.tcard-detail`, không cả
   * `.is-open` lẫn `.is-shrunk` — mọi binding chỉ lên ở vòng kế tiếp sau chừng
   * 60ms. Nên phải đi đường chính thức: `startViewTransition` chấp nhận callback
   * bất đồng bộ và chờ promise xong mới chụp, còn `afterNextRender` cho biết
   * đúng lúc Angular đã dựng xong DOM.
   *
   * Có hẹn giờ chặn: nếu vì lý do nào đó không có vòng dựng nào xảy ra, promise
   * sẽ không bao giờ xong và View Transition treo — màn hình đứng hình ở ảnh
   * chụp cũ, không bấm được gì. Thà mất hiệu ứng còn hơn khoá giao diện.
   *
   * Trình duyệt không hỗ trợ hoặc người dùng bật giảm chuyển động thì đổi thẳng.
   */
  private transition(update: () => void): void {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => unknown;
    };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced || typeof doc.startViewTransition !== 'function') {
      update();
      return;
    }

    doc.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          update();
          const stop = setTimeout(resolve, 250);
          afterNextRender(
            () => {
              clearTimeout(stop);
              resolve();
            },
            { injector: this.injector },
          );
        }),
    );
  }

  /**
   * Đóng thẻ rồi TRẢ TIÊU ĐIỂM về đúng tấm thẻ vừa đóng.
   *
   * Không trả thì tiêu điểm rơi về đầu tài liệu, và người dùng bàn phím phải tab
   * lại từ đầu trang — đúng loại bẫy mà các hộp thoại hay mắc.
   */
  close(index: number): void {
    this.transition(() => this.open.set(null));
    this.cardEls()[index]?.nativeElement.focus();
  }

  /** Escape đóng thẻ đang mở — phản xạ ai cũng thử trước khi đi tìm nút đóng. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    const cur = this.open();
    if (cur === null) return;
    event.preventDefault();
    this.close(cur);
  }
}
