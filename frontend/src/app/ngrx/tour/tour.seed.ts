import { Injectable, inject } from '@angular/core';
import { CardPriority, CreateCardInput } from '../../models';
import { AuthService } from '../../services/auth.service';
import { CardStore } from '../card/card.store';
import { ChatStore } from '../chat/chat.store';
import { ListStore } from '../list/list.store';

/**
 * Gieo dữ liệu mẫu cho tầng 2 của tour, và dọn lại khi xong.
 *
 * Vì sao phải gieo: Filter, Chat và AI **vô nghĩa trên board một thẻ**. Lọc
 * 1/1 thẻ thì người dùng không thấy nó làm gì; assistant không có gì để đọc.
 * Dạy ba thứ đó trên board trống là nói vào khoảng không.
 *
 * ⚠️ Gieo qua API THẬT (quyết định đã duyệt, đặc tả §7). **Đừng** dùng lại
 *    `loadSampleWorkspaces()` ở pages/workspace/workspace.ts — hàm đó ghi mock
 *    vào localStorage, là di sản thời chưa nối backend.
 */

/** Số ngày lệch so với hôm nay; âm = đã quá hạn. */
interface SeedCard {
  list: 0 | 1 | 2;
  title: string;
  priority: CardPriority;
  dueInDays?: number;
  /** true = cố tình KHÔNG gán người, để bộ lọc "unassigned" có cái mà lọc. */
  unassigned?: boolean;
}

/**
 * Tám thẻ, khác nhau CÓ CHỦ ĐÍCH — 3 thẻ High, 2 thẻ quá hạn, 2 thẻ chưa gán
 * người. Bộ số này để bất kỳ tiêu chí lọc nào người dùng thử cũng cho ra một
 * tập con nhìn thấy được, chứ không phải 8/8 hoặc 0/8.
 *
 * Không gán nhãn (label): nhãn phải tồn tại sẵn trên board mới gán được, mà
 * board vừa tạo thì chưa có nhãn nào. Ba tiêu chí trên đã đủ để bộ lọc có ý
 * nghĩa; thêm nhãn là thêm một lượt API nữa cho thứ không dạy gì mới.
 */
const SEED_CARDS: readonly SeedCard[] = [
  { list: 0, title: 'Write the launch checklist', priority: 'high', dueInDays: -3 },
  { list: 0, title: 'Collect feedback from the pilot class', priority: 'medium', unassigned: true },
  { list: 0, title: 'Draft the release notes', priority: 'low', dueInDays: 5 },
  { list: 1, title: 'Fix the sign-in redirect loop', priority: 'high', dueInDays: -1 },
  { list: 1, title: 'Rework the empty board screen', priority: 'medium', dueInDays: 2 },
  { list: 1, title: 'Add keyboard shortcuts to the card modal', priority: 'low', unassigned: true },
  { list: 2, title: 'Ship the invite links', priority: 'high', dueInDays: 7 },
  { list: 2, title: 'Archive the old planning board', priority: 'low' },
];

/** Tên các cột cần có. Thiếu cột nào thì tạo cột đó. */
const SEED_LISTS = ['To Do', 'In progress', 'Done'] as const;

/**
 * Tin nhắn mồi. Tin CUỐI viết có chủ đích để assistant bắt được việc.
 *
 * Vẫn cần, dù bước AI riêng đã gộp vào bước chat: popover bước đó nói "trợ lý
 * đọc chat và thảo sẵn thẻ cho bạn", và câu ấy chỉ thuyết phục khi người dùng
 * mở khung chat ra là thấy đúng cái chip vừa được nhắc tới.
 */
const SEED_MESSAGES: readonly string[] = [
  'Morning — pilot class starts Thursday, so this week is tight.',
  'I pushed the sign-in fix, still seeing the redirect loop on Safari though.',
  'This week we need to finish the landing page, write the tests and deploy to staging.',
];

export interface SeedResult {
  listIds: string[];
  cardIds: string[];
}

@Injectable({ providedIn: 'root' })
export class TourSeedService {
  private readonly lists = inject(ListStore);
  private readonly cards = inject(CardStore);
  private readonly chat = inject(ChatStore);
  private readonly auth = inject(AuthService);

  /**
   * Tạo cột còn thiếu + 8 thẻ + 3 tin nhắn mồi trên board đang mở.
   *
   * Trả về id của **những thứ chính mình tạo ra**, để `cleanup()` dọn đúng chúng
   * — không đụng vào thẻ người dùng tự tạo ở bước 4, cũng không đụng thẻ của
   * đồng đội nếu board có nhiều người.
   */
  async seed(boardId: string): Promise<SeedResult> {
    const created: SeedResult = { listIds: [], cardIds: [] };

    // 1. Cột. Dùng lại cột trùng tên đã có (bước 3 thường đã tạo "To Do") thay
    //    vì tạo thêm cột thứ hai cùng tên — board hai cột "To Do" trông như lỗi.
    const columnIds: string[] = [];
    for (const name of SEED_LISTS) {
      const existing = this.lists
        .lists()
        .find((l) => l.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        columnIds.push(existing.id);
        continue;
      }
      const made = await this.lists.createList(boardId, name);
      if (!made) break;
      columnIds.push(made.id);
      created.listIds.push(made.id);
    }
    if (!columnIds.length) return created;

    // 2. Thẻ, và 3. tin nhắn mồi — chạy song song với nhau.
    //
    // Trong CÙNG một cột thì phải tuần tự: `position` do server cấp theo thứ tự
    // nhận request, bắn song song là thẻ xếp lộn xộn khác nhau mỗi lần chạy.
    // Nhưng các cột KHÔNG ảnh hưởng nhau, và chat lại càng không.
    //
    // Bản đầu làm tuần tự tuốt: đo thật mất **13,1 giây** người dùng ngồi nhìn
    // một cái spinner. Gom theo cột rồi chạy song song thì chuỗi dài nhất chỉ
    // còn 3 thẻ.
    const me = this.auth.currentUserId();
    const theoCot = new Map<string, SeedCard[]>();
    for (const c of SEED_CARDS) {
      const listId = columnIds[Math.min(c.list, columnIds.length - 1)];
      const arr = theoCot.get(listId);
      if (arr) arr.push(c);
      else theoCot.set(listId, [c]);
    }

    const taoThe = [...theoCot.entries()].map(async ([listId, nhom]) => {
      const ids: string[] = [];
      for (const c of nhom) {
        const input: CreateCardInput = {
          title: c.title,
          priority: c.priority,
          assigneeId: c.unassigned ? undefined : me || undefined,
          dueDate: c.dueInDays === undefined ? undefined : isoInDays(c.dueInDays),
        };
        const made = await this.cards.createCard(listId, input);
        if (made) ids.push(made.id);
      }
      return ids;
    });

    // Tin nhắn cũng tuần tự với nhau — thứ tự hội thoại phải đúng, và tin CUỐI
    // mới là tin assistant cần đọc. Hỏng thì kệ: mất bước AI chứ không hỏng cả
    // tour, và một toast lỗi giữa lúc đang hướng dẫn còn tệ hơn.
    const guiTin = (async () => {
      for (const text of SEED_MESSAGES) {
        try {
          await this.chat.sendMessage(boardId, text, []);
        } catch {
          break;
        }
      }
    })();

    const nhomIds = await Promise.all(taoThe);
    await guiTin;
    for (const ids of nhomIds) created.cardIds.push(...ids);

    return created;
  }

  /**
   * Xoá đúng những gì `seed()` đã tạo.
   *
   * Xoá thẻ trước rồi mới xoá cột: xoá cột trước thì các thẻ bên trong bị xoá
   * theo dây chuyền ở database, và vòng lặp sau đó gọi xoá từng thẻ đã biến mất
   * — mỗi lượt một lỗi 404 vô nghĩa trong log.
   */
  async cleanup(seeded: SeedResult): Promise<void> {
    // Xoá thẻ song song được: không như lúc tạo, xoá không cần giữ thứ tự
    // `position` nào cả. Tuần tự 8 lượt đo được 6 giây người dùng nhìn spinner.
    await Promise.all(
      seeded.cardIds.map(async (id) => {
        try {
          await this.cards.deleteCard(id);
        } catch {
          // Thẻ có thể đã bị người dùng xoá tay. Bỏ qua, dọn tiếp cái khác.
        }
      }),
    );
    for (const id of seeded.listIds) {
      try {
        await this.lists.deleteList(id);
      } catch {
        /* như trên */
      }
    }
  }
}

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
