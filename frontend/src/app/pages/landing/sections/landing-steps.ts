import { Component } from '@angular/core';
import { LucideBuilding2, LucideKanban, LucideSparkles, LucideUserPlus } from '@lucide/angular';
import { RevealDirective } from '../../../directives/reveal.directive';
import { ScrambleInDirective } from '../../../directives/scramble-in.directive';

/**
 * "Cách hoạt động" — bốn bước, mỗi bước một hình minh hoạ nhỏ tự dựng khi cuộn
 * tới.
 *
 * Cố tình KHÔNG làm kiểu cuộn ngang chiếm màn hình: nó đẹp trong ảnh chụp và
 * khó chịu khi dùng thật — cuộn bằng bàn di chuột thì nhảy giật, bàn phím thì
 * mắc kẹt, mà nội dung ở đây chỉ có bốn câu ngắn. Đơn giản và chắc chắn thắng.
 */
@Component({
  selector: 'app-landing-steps',
  imports: [
    RevealDirective,
    ScrambleInDirective,
    LucideBuilding2,
    LucideKanban,
    LucideSparkles,
    LucideUserPlus,
  ],
  templateUrl: './landing-steps.html',
  styleUrls: ['../_landing-shared.css', './landing-steps.css'],
})
export class LandingSteps {
  readonly steps = [
    {
      no: '01',
      icon: 'org' as const,
      title: 'Create the organization',
      desc: 'Sign in with Google and name your team. You become the owner and get a URL of your own.',
    },
    {
      no: '02',
      icon: 'invite' as const,
      title: 'Invite your teammates',
      desc: 'Send an invitation to their email. They accept it from the notification bell and they are in.',
    },
    {
      no: '03',
      icon: 'board' as const,
      title: 'Build a board, split the columns',
      desc: 'A workspace per area, a board per project, and the columns arranged however you like.',
    },
    {
      no: '04',
      icon: 'ai' as const,
      title: 'Get to work',
      desc: 'Drag the cards, talk it over in chat, and confirm each time the assistant spots a new job.',
    },
  ];
}
