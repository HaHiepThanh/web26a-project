import { Component } from '@angular/core';
import { LucideCheck, LucideMinus } from '@lucide/angular';
import { RevealDirective } from '../../../directives/reveal.directive';
import { ScrambleInDirective } from '../../../directives/scramble-in.directive';

/**
 * Khối trả lời thẳng câu hỏi mà ai cũng nghĩ trong đầu ở đoạn này của trang.
 *
 * Cột bên phải — "cứ dùng Trello khi" — là cột quan trọng nhất, dù nó nói xấu
 * chính mình. Một trang giới thiệu chịu nói ra chỗ mình không hợp thì cái nó
 * khen về mình mới đáng tin; còn nếu mọi ô đều là dấu tích của bên mình thì
 * người đọc chỉ nhún vai bỏ qua cả bảng.
 *
 * Bản trước chỉ nêu được đúng MỘT điểm hơn (trợ lý đọc chat) nên đọc ra như một
 * sản phẩm chỉ có một chiêu. Bản này nêu bốn điểm thuộc bốn loại khác nhau —
 * phạm vi, tốc độ vào việc, quyền sở hữu dữ liệu, chi phí — để lý do chọn không
 * đứng cả vào một cái chân.
 */
@Component({
  selector: 'app-landing-compare',
  imports: [RevealDirective, ScrambleInDirective, LucideCheck, LucideMinus],
  templateUrl: './landing-compare.html',
  styleUrls: ['../_landing-shared.css', './landing-compare.css'],
})
export class LandingCompare {
  readonly ours = [
    'Everything fits on one screen. There is no settings tree to learn and nothing to configure before your first card.',
    'Your team is small enough that admin tooling is overhead, not a feature.',
    'Work keeps being born mid-conversation, and you want it to land on the board without being retyped.',
    'You want to keep the data in-house — it can run entirely on a machine you control.',
    'You would rather pay nothing than pay per seat for features nobody opens.',
  ];

  readonly theirs = [
    'You need Power-Ups, Butler automation, or connections to a hundred other services.',
    'Your company already pays Atlassian and everything lives there already.',
    'You need a native mobile app, offline mode, or enterprise administration.',
    'Your team is large enough that permissions and audit trails matter more than speed.',
  ];
}
