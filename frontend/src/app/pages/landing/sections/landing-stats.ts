import { Component } from '@angular/core';
import { CountUpDirective } from '../../../directives/count-up.directive';
import { LineRevealDirective } from '../../../directives/line-reveal.directive';
import { ScrollSkewDirective } from '../../../directives/scroll-skew.directive';
import { RevealDirective } from '../../../directives/reveal.directive';

/**
 * Dải số liệu.
 *
 * Bản trước đếm endpoint và module phía máy chủ. Số thì thật, nhưng đó là số
 * liệu dành cho người viết code — người vào xem sản phẩm không biết một module
 * là gì và cũng không cần biết. Bốn con số ở đây nói về việc DÙNG nó ra sao.
 *
 * Xếp đếm ngược 3 → 2 → 1 → 0 có chủ ý: mắt đi hết dải là dừng ở số 0, cũng là
 * điều dễ nhớ nhất — không phải cài, không phải cấu hình, không phải trả tiền.
 *
 * Vẫn không có "một triệu người dùng tin tưởng" nào ở đây: sản phẩm mới ra, con
 * số đó sẽ là nói dối, mà số liệu bịa là thứ dễ mất uy tín nhất.
 */
@Component({
  selector: 'app-landing-stats',
  imports: [LineRevealDirective, ScrollSkewDirective, RevealDirective, CountUpDirective],
  templateUrl: './landing-stats.html',
  styleUrls: ['../_landing-shared.css', './landing-stats.css'],
})
export class LandingStats {
  readonly stats = [
    {
      value: 3,
      suffix: '',
      label: 'Roles per organisation',
      note: 'Owner, admin, member — so everyone sees what they should and nothing more.',
    },
    {
      value: 2,
      suffix: '',
      label: 'Minutes to your first board',
      note: 'Sign in, name your team, start dragging. No setup call, no onboarding wizard.',
    },
    {
      value: 1,
      suffix: '',
      label: 'Click from message to card',
      note: 'The assistant fills the card in. You press the button — it never creates one alone.',
    },
    {
      value: 0,
      suffix: '',
      label: 'To install, configure or pay',
      note: 'It runs in the browser you already have. There is no paid tier to upgrade to.',
    },
  ];
}
