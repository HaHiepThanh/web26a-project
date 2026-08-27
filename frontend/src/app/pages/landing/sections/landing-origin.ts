import { Component } from '@angular/core';
import { LineRevealDirective } from '../../../directives/line-reveal.directive';
import { ScrollSkewDirective } from '../../../directives/scroll-skew.directive';
import { RevealDirective } from '../../../directives/reveal.directive';

/**
 * "Our story" — trang từ điển giải nghĩa ba chữ của cái tên.
 *
 * VÌ SAO KHÔNG CÒN LÀ LÁ THƯ: bản trước là chín đoạn văn xuôi trên một tờ giấy
 * nghiêng. Đọc thì ấm, nhưng thứ quan trọng nhất của cả khu vực — NGHĨA của
 * Horizon, Hub, Harmony — bị chôn trong đoạn thứ tư, và giữa một trang toàn thứ
 * nghịch được thì một bức tường chữ chỉ bị lướt qua.
 *
 * Nay hình thức khớp với việc cần làm: giải nghĩa ba từ thì mượn luôn hình thức
 * của cuốn từ điển. Mục từ, từ loại, lời định nghĩa, rồi một dòng nối nghĩa ấy
 * với thứ có thật trong sản phẩm. `<dl>` ở đây là thẻ đúng nghĩa đen, không
 * phải div đóng vai.
 *
 * Component RỖNG, và đó là chủ ý. Khu vực này không có state, không tương tác,
 * không GSAP — toàn bộ chuyển động (ba chữ H tự viết ra và chữ ký tự ký) làm
 * bằng scroll timeline của CSS.
 *
 * Hai lý do chọn CSS thay vì GSAP ở riêng chỗ này:
 *  - Ít thứ phải phối hợp hơn cho một khu vực chỉ cần hai chuyển động tuyến tính.
 *  - Kiểm chứng được. Tween của GSAP chạy trên requestAnimationFrame, mà trong
 *    môi trường tự động rAF không chạy nên không quan sát được; giá trị của
 *    scroll timeline thì đọc thẳng từ computed style.
 *
 * GSAP vẫn giữ cho hero và khu tính năng, nơi thật sự cần xâu chuỗi nhiều bước.
 */
@Component({
  selector: 'app-landing-origin',
  imports: [LineRevealDirective, ScrollSkewDirective, RevealDirective],
  templateUrl: './landing-origin.html',
  styleUrls: ['../_landing-shared.css', './landing-origin.css'],
})
export class LandingOrigin {}
