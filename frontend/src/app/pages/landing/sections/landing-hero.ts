import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight, LucideCheck, LucideSparkles, LucideZap } from '@lucide/angular';
import { MagneticDirective } from '../../../directives/magnetic.directive';
import { LineRevealDirective } from '../../../directives/line-reveal.directive';
import { RevealDirective } from '../../../directives/reveal.directive';
import { LandingTry } from './landing-try';

/**
 * Khu vực mở đầu: câu chào, hai nút, và NGAY BÊN DƯỚI là tấm bảng chơi được.
 *
 * ⚠️ KHU NÀY TỪNG CÓ MỘT TẤM BẢNG RIÊNG, và nó đã bị gỡ hẳn — đừng dựng lại.
 *
 * Bản trước có một bảng Kanban thu nhỏ TỰ DIỄN ở đây: hai tấm thẻ tự bay qua
 * lại giữa ba cột theo một lịch ngẫu nhiên, kèm vệt loé ở cột vừa nhận thẻ và
 * một cảnh ngả-ra-sau chạy theo thanh cuộn. Nhìn thì đẹp, nhưng chạm vào không
 * được gì — mà mãi phía dưới trang lại còn một tấm bảng THẬT, chơi được đầy đủ.
 *
 * Hai tấm bảng kể đúng một câu chuyện, và tấm người đọc gặp TRƯỚC lại là tấm
 * yếu hơn: họ xem một đoạn hoạt hình, rồi phải cuộn tiếp mới gặp thứ thật sự
 * bấm được. Trang phải mang một dòng chỉ đường ("bảng của bạn ở vài màn phía
 * dưới") chỉ để chữa cái nhầm lẫn do chính nó gây ra.
 *
 * Nên gộp còn MỘT: tấm bảng đầu tiên người ta thấy cũng chính là tấm chạm được.
 * Câu chào ngay trên nó hứa "kéo thẻ là tự lưu, không có nút Save" — và người
 * đọc chứng minh được lời hứa đó ngay tại chỗ, trong hai giây, không phải đi
 * tìm. Toàn bộ phần bảng nay nằm ở `LandingTry`.
 *
 * Nhờ vậy component này không còn logic nào: không hẹn giờ, không
 * IntersectionObserver, không cảnh GSAP. Chỉ còn chữ và mấy tấm thẻ trang trí
 * trôi quanh tiêu đề, vốn thuần CSS.
 */
@Component({
  selector: 'app-landing-hero',
  imports: [
    RouterLink,
    LineRevealDirective,
    RevealDirective,
    MagneticDirective,
    LandingTry,
    LucideArrowRight,
    LucideCheck,
    LucideSparkles,
    LucideZap,
  ],
  templateUrl: './landing-hero.html',
  styleUrls: ['../_landing-shared.css', './landing-hero.css'],
})
export class LandingHero {
  readonly trust = ['Free for small teams', 'Sign in with Google', 'Nothing to install'];
}
