import { Directive, ElementRef, OnDestroy, afterNextRender, inject } from '@angular/core';

/**
 * Tiêu đề hiện lên THEO TỪNG DÒNG: mỗi dòng trượt lên từ dưới một khung cắt,
 * dòng sau đi sau dòng trước.
 *
 * Cách dùng: <h2 appLineReveal>. Không dùng chung với `appReveal` — nhịp so le
 * giữa các dòng đã thay cho `revealDelay` rồi.
 *
 * VÌ SAO PHẢI ĐỘNG VÀO DOM: CSS không có cách nào chọn "dòng thứ hai" của một
 * đoạn chữ. `::first-line` chỉ với tới dòng đầu, và chỗ xuống dòng thì phụ thuộc
 * bề ngang, cỡ chữ, phông đã tải xong hay chưa. Cách duy nhất là hỏi trình duyệt
 * đã ngắt dòng ở đâu (đo hộp của từng từ), rồi gom các từ cùng cao độ vào một
 * khung riêng.
 *
 * BA CÁI BẪY, đều đã gặp thật:
 *
 *  1. CHỮ TÔ GRADIENT. `background-clip: text` tô nền theo TỪNG PHẦN TỬ. Tách
 *     `<span class="lp-grad">` thành từng từ thì mỗi từ lãnh một dải gradient
 *     riêng, và cụm chữ đang chuyển màu mượt biến thành mấy mảnh sặc sỡ rời rạc.
 *     Nên phần tử con được giữ NGUYÊN CẢ CỤM làm một đơn vị, không tách vào bên
 *     trong.
 *
 *  2. ĐƠN VỊ TỰ NÓ VẮT QUA HAI DÒNG. Hệ quả của điều 1: nếu cụm gradient dài tới
 *     mức phải xuống dòng, nó thuộc về hai dòng cùng lúc và không nhét vào khung
 *     cắt nào được. Gặp ca đó thì BỎ HẲN việc tách, cho tiêu đề hiện thường —
 *     mất phần diễn còn hơn vỡ bố cục.
 *
 *  3. `overflow: hidden` CẮT CỤT NÉT THẢ XUỐNG. Khung cắt của mỗi dòng sẽ xén
 *     mất đuôi chữ g, y, p và toàn bộ dấu tiếng Việt nằm dưới. Xử lý bằng đệm
 *     dưới rồi kéo lại bằng margin âm (xem _landing-shared.css).
 *
 * Tách lại khi đổi bề ngang và khi phông tải xong, vì cả hai đều làm chỗ ngắt
 * dòng đổi chỗ.
 */
@Directive({
  selector: '[appLineReveal]',
  host: { class: 'line-reveal' },
})
export class LineRevealDirective implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** HTML gốc, giữ lại để tách lại từ đầu mỗi lần bố cục đổi. */
  private original = '';

  /**
   * Tên thuộc tính đóng gói style của Angular (`_ngcontent-ng-c123…`) lấy từ
   * chính phần tử chủ.
   *
   * ⚠️ BẮT BUỘC, và đây là lỗi đã gặp thật. Angular dùng emulated encapsulation:
   * mọi selector trong CSS của component bị viết lại thành
   * `.lr-ln[_ngcontent-ng-c123]`. Các span dưới đây do JavaScript tạo ra bằng
   * `createElement` nên KHÔNG có thuộc tính đó, và toàn bộ style trượt qua
   * chúng — đo được: `transform` ra `none`, `overflow` ra `visible`, tức là
   * không khung cắt, không dịch chuyển, hiệu ứng im lặng không chạy mà cũng
   * chẳng báo lỗi gì. Phải tự đóng dấu thuộc tính này lên mọi phần tử tạo mới.
   */
  private scopeAttr: string | null = null;
  private observer?: IntersectionObserver;
  private resize?: ResizeObserver;
  private lastWidth = 0;
  private shown = false;

  constructor() {
    afterNextRender(() => {
      const el = this.host.nativeElement as HTMLElement;
      this.original = el.innerHTML;
      this.scopeAttr =
        el.getAttributeNames().find((n) => n.startsWith('_ngcontent-')) ?? null;

      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced || typeof IntersectionObserver === 'undefined') {
        // Giữ nguyên trạng thái cuối: chữ hiện đủ, chỉ bỏ đường đi tới đó.
        el.classList.add('is-ready', 'is-in');
        return;
      }

      this.split();

      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            this.shown = true;
            el.classList.add('is-in');
            this.observer?.unobserve(el);
          }
        },
        { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
      );
      this.observer.observe(el);

      if (typeof ResizeObserver !== 'undefined') {
        this.lastWidth = el.getBoundingClientRect().width;
        this.resize = new ResizeObserver(() => {
          const w = el.getBoundingClientRect().width;
          // CHỈ tách lại khi bề ngang đổi. Việc tách làm chiều cao phần tử đổi
          // theo, mà ResizeObserver nghe cả chiều cao — không chặn thì nó tự
          // gọi lại chính mình thành vòng lặp vô tận.
          if (Math.abs(w - this.lastWidth) < 1) return;
          this.lastWidth = w;
          this.split();
        });
        this.resize.observe(el);
      }

      // Phông tải xong thì chỗ ngắt dòng đổi — đo lúc còn phông dự phòng là đo sai.
      document.fonts?.ready.then(() => this.split());
    });
  }

  /**
   * Dựng lại phần tử thành từng dòng.
   *
   * Luôn bọc trong try/finally và luôn gắn `is-ready`: CSS để tiêu đề ở
   * `opacity: 0` cho tới khi tách xong (tránh chớp một nhịp chữ chưa tách). Nếu
   * hàm này ném lỗi mà không gắn cờ, tiêu đề sẽ VÔ HÌNH VĨNH VIỄN — mất nội
   * dung, lỗi nặng hơn nhiều so với mất hiệu ứng.
   */
  private split(): void {
    const el = this.host.nativeElement as HTMLElement;
    try {
      el.classList.remove('is-split');
      el.innerHTML = this.original;

      const units = this.toUnits(el);
      if (!units.length) return;

      const lines = this.groupIntoLines(units);
      if (!lines) return; // có đơn vị vắt qua hai dòng — xem bẫy số 2

      lines.forEach((line, i) => this.wrapLine(line, i));
      el.classList.add('is-split');
      if (this.shown) el.classList.add('is-in');
    } finally {
      el.classList.add('is-ready');
    }
  }

  /**
   * Tạo một <span> đã đóng dấu thuộc tính đóng gói style — xem ghi chú ở
   * `scopeAttr`. Mọi phần tử tạo mới đều phải đi qua đây.
   */
  private span(className: string): HTMLElement {
    const el = document.createElement('span');
    el.className = className;
    if (this.scopeAttr) el.setAttribute(this.scopeAttr, '');
    return el;
  }

  /**
   * Cắt nội dung thành các ĐƠN VỊ đo được: chữ trần thành từng từ, còn phần tử
   * con giữ nguyên cả cụm (bẫy số 1).
   */
  private toUnits(el: HTMLElement): HTMLElement[] {
    const units: HTMLElement[] = [];

    for (const child of [...el.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = (child.textContent ?? '').split(/(\s+)/);
        const frag = document.createDocumentFragment();
        for (const part of parts) {
          if (!part) continue;
          if (!part.trim()) {
            // Giữ lại khoảng trắng nguyên vẹn, không thì các từ dính liền nhau.
            frag.appendChild(document.createTextNode(part));
            continue;
          }
          const unit = this.span('lr-u');
          unit.textContent = part;
          frag.appendChild(unit);
          units.push(unit);
        }
        (child as ChildNode).replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const unit = this.span('lr-u');
        (child as ChildNode).replaceWith(unit);
        unit.appendChild(child);
        units.push(unit);
      }
    }

    return units;
  }

  /**
   * Gom các đơn vị cùng cao độ vào một dòng. Trả về `null` nếu có đơn vị nào tự
   * nó vắt qua hai dòng — lúc đó không tách được (bẫy số 2).
   */
  private groupIntoLines(units: HTMLElement[]): HTMLElement[][] | null {
    const lines: HTMLElement[][] = [];
    let lastTop: number | null = null;

    for (const unit of units) {
      const rects = unit.getClientRects();
      if (rects.length !== 1) return null;

      const top = Math.round(rects[0].top);
      // Ngưỡng 2px cho sai số làm tròn của kiểu chữ, không phải cho dòng mới.
      if (lastTop === null || Math.abs(top - lastTop) > 2) {
        lines.push([]);
        lastTop = top;
      }
      lines[lines.length - 1].push(unit);
    }

    return lines;
  }

  /**
   * Bọc một dòng vào khung cắt.
   *
   * Dùng Range chứ không nhặt từng phần tử: giữa các từ còn có node khoảng
   * trắng, nhặt riêng mấy cái span thì khoảng trắng rơi lại phía sau và cả dòng
   * dính liền thành một chuỗi.
   */
  private wrapLine(line: HTMLElement[], index: number): void {
    const range = document.createRange();
    range.setStartBefore(line[0]);
    range.setEndAfter(line[line.length - 1]);

    const inner = this.span('lr-i');
    inner.style.setProperty('--i', String(index));
    inner.appendChild(range.extractContents());

    const outer = this.span('lr-ln');
    outer.appendChild(inner);

    // extractContents() đã thu phạm vi về đúng chỗ vừa lấy đi, nên chèn vào đây
    // là trả khối mới đúng vị trí cũ.
    range.insertNode(outer);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.resize?.disconnect();
  }
}
