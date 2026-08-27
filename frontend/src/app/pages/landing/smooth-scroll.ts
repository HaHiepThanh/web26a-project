import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

/**
 * Cuộn có quán tính (Lenis) + trục thời gian theo cuộn (GSAP ScrollTrigger),
 * đóng gói thành một thứ bật/tắt được.
 *
 * CHỈ DÙNG CHO TRANG GIỚI THIỆU. Đừng bật cho phần app đã đăng nhập: bảng công
 * việc có kéo thả, mà cuộn quán tính thì con trỏ và mặt bảng trượt lệch pha nhau
 * — thứ trông sang trên một trang đọc lại thành khó chịu trên một trang làm việc.
 * Vì vậy vòng đời của nó gắn với component Landing, không phải với app.
 *
 * Ba thứ phải nối đúng thì hai thư viện mới sống chung được:
 *
 *  1. Lenis phải chạy trong ticker của GSAP, không phải requestAnimationFrame
 *     riêng. Hai vòng lặp rAF độc lập sẽ lệch nhau một khung hình, và ScrollTrigger
 *     đọc phải vị trí cuộn của khung trước — biểu hiện là mọi hoạt ảnh giật nhẹ
 *     và trễ một nhịp so với tay cuộn.
 *  2. `lagSmoothing(0)`: mặc định GSAP thấy một khung hình chậm là tự "bù" bằng
 *     cách nhảy cóc thời gian. Với hoạt ảnh chạy theo cuộn thì cú nhảy đó thành
 *     ra hình bị tua vọt.
 *  3. ScrollTrigger.update phải chạy mỗi lần Lenis cuộn, vì Lenis không phát ra
 *     sự kiện `scroll` gốc theo cách ScrollTrigger tự bắt được.
 */
export class SmoothScroll {
  private lenis?: Lenis;
  private readonly onLenisScroll = () => ScrollTrigger.update();
  private tickerFn?: (time: number) => void;

  /** Có đang chạy không — dùng để quyết định cuộn tới mốc bằng Lenis hay bằng DOM. */
  get active(): boolean {
    return !!this.lenis;
  }

  /**
   * @returns true nếu thực sự bật. Trả về false khi người dùng đã yêu cầu giảm
   * chuyển động — cuộn quán tính đúng là loại chuyển động toàn màn hình mà cài
   * đặt đó sinh ra để dập, và với người rối loạn tiền đình thì nó gây chóng mặt
   * thật chứ không phải bất tiện.
   */
  start(): boolean {
    if (this.lenis) return true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;

    gsap.registerPlugin(ScrollTrigger);

    this.lenis = new Lenis({
      // 1.05 ~ vừa đủ nặng tay để cảm thấy có quán tính, chưa tới mức người dùng
      // thấy trang "trôi tiếp" sau khi đã ngừng cuộn.
      duration: 1.05,
      // Chuột thường giữ nguyên tốc độ; cảm ứng để 1.4 vì vuốt trên màn cảm ứng
      // vốn đã có quán tính của hệ điều hành, hãm thêm sẽ thành ì.
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });

    this.lenis.on('scroll', this.onLenisScroll);

    this.tickerFn = (time: number) => this.lenis?.raf(time * 1000);
    gsap.ticker.add(this.tickerFn);
    gsap.ticker.lagSmoothing(0);

    return true;
  }

  /** Cuộn tới một phần tử. Đi qua Lenis khi nó đang chạy, vì `scrollIntoView`
   *  của trình duyệt và Lenis sẽ giành nhau quyền điều khiển vị trí cuộn. */
  scrollTo(target: HTMLElement | number, offset = 0): void {
    this.lenis?.scrollTo(target, { offset });
  }

  stop(): void {
    if (this.tickerFn) gsap.ticker.remove(this.tickerFn);
    gsap.ticker.lagSmoothing(500, 33); // trả về mặc định của GSAP
    this.lenis?.off('scroll', this.onLenisScroll);
    this.lenis?.destroy();
    this.lenis = undefined;
    this.tickerFn = undefined;
    // Rời trang mà không dọn thì các trigger vẫn bám vào DOM đã bị huỷ, và lần
    // sau quay lại trang sẽ có hai bộ trigger chồng lên nhau.
    ScrollTrigger.getAll().forEach((t) => t.kill());
  }
}
