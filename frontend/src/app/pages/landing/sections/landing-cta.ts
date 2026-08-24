import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight } from '@lucide/angular';
import { MagneticDirective } from '../../../directives/magnetic.directive';
import { RevealDirective } from '../../../directives/reveal.directive';

/**
 * Lời mời cuối trang.
 *
 * Chỉ một nút, và nó là nút chính duy nhất của khu vực. Người đọc tới được đây
 * là đã đọc hết trang — cho họ hai lựa chọn ngang nhau lúc này chỉ khiến họ phải
 * cân nhắc thêm một lần nữa mà chẳng để làm gì.
 */
@Component({
  selector: 'app-landing-cta',
  imports: [RouterLink, RevealDirective, MagneticDirective, LucideArrowRight],
  templateUrl: './landing-cta.html',
  styleUrls: ['../_landing-shared.css', './landing-cta.css'],
})
export class LandingCta {}
