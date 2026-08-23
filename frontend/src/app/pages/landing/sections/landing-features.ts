import { Component } from '@angular/core';
import {
  LucideActivity,
  LucideCalendarClock,
  LucideListChecks,
  LucideMessageSquare,
  LucideMove,
  LucideShieldCheck,
  LucideTag,
  LucideUsers,
} from '@lucide/angular';
import { RevealDirective } from '../../../directives/reveal.directive';
import { SpotlightDirective } from '../../../directives/spotlight.directive';

/**
 * Lưới bento — các ô cố tình lệch kích thước nhau.
 *
 * Lưới ba cột đều tăm tắp thì mọi tính năng trông quan trọng như nhau, mà thực
 * tế không phải: kéo thả là thứ người ta dùng hàng trăm lần một ngày, nhật ký
 * hoạt động thì thi thoảng mới mở. Ô to nhỏ khác nhau chính là cách nói ra thứ
 * tự ưu tiên đó mà không cần viết chữ "quan trọng nhất".
 *
 * Mỗi ô có một đèn rọi bám con trỏ (`appSpotlight`), chỉ bật trên máy có chuột.
 */
@Component({
  selector: 'app-landing-features',
  imports: [
    RevealDirective,
    SpotlightDirective,
    LucideActivity,
    LucideCalendarClock,
    LucideListChecks,
    LucideMessageSquare,
    LucideMove,
    LucideShieldCheck,
    LucideTag,
    LucideUsers,
  ],
  templateUrl: './landing-features.html',
  styleUrls: ['../_landing-shared.css', './landing-features.css'],
})
export class LandingFeatures {}
