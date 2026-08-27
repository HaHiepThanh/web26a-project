import { Component } from '@angular/core';
import { LineRevealDirective } from '../../../directives/line-reveal.directive';
import { RevealDirective } from '../../../directives/reveal.directive';

/**
 * Câu hỏi thường gặp.
 *
 * Dựng bằng <details>/<summary> thuần chứ không phải div + JS: thẻ này đã có
 * sẵn hành vi đóng mở, đã lên tab được, đã báo trạng thái cho trình đọc màn
 * hình, và vẫn mở được cả khi JS chết. Viết tay lại bằng div thì phải tự lo
 * aria-expanded, phím Enter/Space, focus — để rồi làm ra thứ tệ hơn.
 *
 * Câu hỏi chọn theo đúng những chỗ trang này tự khơi ra mà chưa trả lời: khối
 * so sánh khoe "tự host được" và thú nhận "chưa có app di động", nhưng không
 * nói dữ liệu nằm đâu, bao nhiêu người dùng được, hay trợ lý thật ra đọc gì.
 * Ba câu trả lời dưới đây cố ý nói cả phần chưa có — người đọc tin phần khoe
 * hơn hẳn khi thấy phần thiếu cũng được nói thẳng.
 */
@Component({
  selector: 'app-landing-faq',
  imports: [LineRevealDirective, RevealDirective],
  templateUrl: './landing-faq.html',
  styleUrls: ['../_landing-shared.css', './landing-faq.css'],
})
export class LandingFaq {
  readonly items = [
    {
      q: 'Is it actually free?',
      a: 'Yes. There is no paid tier, no trial clock and nothing to cancel — no card is asked for at any point.',
    },
    {
      q: 'Where does my data live?',
      a: 'On a private database that only your organisation can read, behind a proper sign-in. If you would rather keep it in-house, you can run the whole thing on your own server.',
    },
    {
      q: 'How large a team does it handle?',
      a: 'There is no hard limit, but it is built and tested for teams under about fifteen people. Past that you will want something with real administration tooling.',
    },
    {
      q: 'Can I import my boards from Trello?',
      a: 'Not yet. Boards, lists and cards are created by hand today. An importer is the thing we get asked for most, and it is next on the list.',
    },
    {
      q: 'Is there a mobile app?',
      a: 'No native app. The site works in a phone browser, and the board scrolls sideways the way you would expect it to.',
    },
    {
      q: 'What does the assistant actually read?',
      a: 'Only messages in a board’s own chat, and only the ones that look like someone handing out work. It never creates a card by itself — every single one waits for you to confirm.',
    },
  ];
}
