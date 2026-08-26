/**
 * Tầng 3 — coach mark. Đặc tả: docs/HUONG-DAN-NGUOI-DUNG-MOI.md §3.3
 *
 * Coach mark KHÁC bước tour ở *thời điểm*, không phải ở hình thức:
 *
 *   | | Tour | Coach mark |
 *   |---|---|---|
 *   | Khi nào | người dùng chủ động bấm "Hướng dẫn tôi" | tự bật khi một điều kiện xảy ra |
 *   | Độ dài | chuỗi nhiều bước, có Next/Back | MỘT bong bóng, một câu, một nút |
 *   | Ngắt việc | có | không — họ vẫn đang làm, nó chỉ ghé vào |
 *   | Lặp lại | chạy lại được từ Cài đặt | đọc rồi là thôi |
 *
 * Vì sao tách khỏi tour: nói "bạn có thể lọc thẻ" khi trong tay đang có 0 thẻ là
 * câu rơi vào khoảng không — chưa có vấn đề nào để câu đó giải quyết, não không
 * lưu. Coach mark đảo thứ tự: **để vấn đề xuất hiện trước, rồi mới đưa lời giải**.
 */

/** Những gì trang Board báo về để chấm điều kiện. */
export interface CoachContext {
  /** Số thẻ đang có trên board này. */
  cards: number;
  /** Số cột đang có trên board này. */
  lists: number;
  /** Số người đang cùng xem board, kể cả mình. */
  viewers: number;
  /** Nội dung board rộng hơn khung nhìn — phải cuộn ngang mới xem hết. */
  overflowsWidth: boolean;
  /** Đang ở chế độ xếp cột hay xếp hàng. */
  layout: 'column' | 'row';
  /** Có modal chi tiết thẻ nào đang mở không (bất kỳ thẻ nào). */
  cardModalOpen: boolean;
  /** Thẻ đang mở là thẻ VỪA TẠO — chưa lưu, đóng ngang là mất. */
  freshCardOpen: boolean;
  /** Số tiêu chí lọc đang bật. */
  filterCriteria: number;
  /** Số thành viên có thể giao việc trên board này. */
  members: number;
}

export interface CoachMark {
  /** Ghi vào `seenCoachMarks`; đổi id là coi như một mẩu chỉ dẫn mới. */
  id: string;
  /**
   * `data-tour` của phần tử được chỉ vào.
   *
   * ⚠️ Điều kiện `when` phải bảo đảm phần tử này ĐANG HIỆN. Chọn một mẩu mà neo
   *    không có trên màn hình là tiêu mất lượt rồi chẳng hiện gì — ví dụ neo
   *    `assignee` chỉ tồn tại bên trong modal chi tiết thẻ, nên điều kiện của nó
   *    bắt buộc phải có `cardModalOpen`.
   */
  anchor: string;
  /** MỘT câu. Dài hơn là thành bài giảng, mà người ta đang làm việc dở. */
  text: string;
  /** Điều kiện bật. Đọc là hiểu ngay vấn đề nó đang giải. */
  when: (c: CoachContext) => boolean;
}

/**
 * Thứ tự trong mảng là thứ tự ưu tiên khi nhiều cái cùng đủ điều kiện — mỗi lần
 * chỉ hiện một cái, nên cái đứng trước thắng.
 *
 * Danh sách đặc tả còn stats modal, đổi theme, link mời. Cố ý CHƯA làm:
 *   - đổi theme  — không giải quyết vấn đề nào, chỉ là thông báo tính năng. Đúng
 *     loại biến coach mark thành tiếng ồn.
 *   - stats      — không có khoảnh khắc nào mà "có trang thống kê" là lời giải
 *     cho thứ người dùng đang cảm thấy.
 *   - link mời   — trùng việc với `invite-member-hint`.
 */
export const COACH_MARKS: readonly CoachMark[] = [
  {
    id: 'name-card-hint',
    anchor: 'card-title',
    // Đứng ĐẦU vì đây là mẩu duy nhất ngăn MẤT DỮ LIỆU, không phải giới thiệu
    // tính năng. `isAbandonedFreshCard` trong modal xoá thẳng thẻ vừa tạo nếu
    // đóng đi mà chưa sửa gì. Tour có cảnh báo ở bước 4, nhưng ai bỏ qua tour
    // thì không bao giờ biết — và họ mất thẻ, im lặng, không hoàn tác được.
    when: (c) => c.freshCardOpen,
    text: 'Give it a name and save — a card closed without one is thrown away.',
  },
  {
    id: 'filter-hint',
    anchor: 'filter',
    // 12 thẻ: qua ngưỡng này thì một màn hình không còn nhìn hết được nữa, tức
    // là lúc "tìm một thẻ" bắt đầu tốn công. Trước đó Filter chưa giải quyết gì.
    when: (c) => !c.cardModalOpen && c.cards > 12,
    text: 'Board getting busy? Filter by assignee, label, priority or due date.',
  },
  {
    id: 'saved-filter-hint',
    anchor: 'save-filter',
    // Ba tiêu chí trở lên = vừa bỏ công dựng một bộ lọc thật, và "lưu lại" trả
    // được công đó. Một tiêu chí thì chưa có gì đáng lưu.
    when: (c) => c.filterCriteria >= 3,
    text: 'Save this as a quick filter and it is one click next time.',
  },
  {
    id: 'layout-hint',
    anchor: 'layout',
    // Nhiều cột + đang ở chế độ cột + phải cuộn ngang = đúng lúc Row View đáng
    // giá. Gợi ý khi mới có hai cột thì họ chưa thấy vấn đề đâu mà đổi.
    when: (c) => !c.cardModalOpen && c.lists >= 4 && c.layout === 'column' && c.overflowsWidth,
    text: 'Too much sideways scrolling? Row View stacks the columns instead.',
  },
  {
    id: 'minimap-hint',
    anchor: 'minimap',
    when: (c) => !c.cardModalOpen && c.overflowsWidth && c.lists >= 3,
    text: 'The mini map shows the whole board — drag it to jump around.',
  },
  {
    id: 'viewers-hint',
    anchor: 'viewers',
    // Không giải thích thì người ta tưởng lỗi: tự nhiên có mấy khuôn mặt lạ hiện
    // ra ở đầu board, và thẻ thì tự di chuyển.
    when: (c) => !c.cardModalOpen && c.viewers >= 2,
    text: 'Someone else is on this board right now. Their changes appear as they happen.',
  },
  {
    id: 'invite-member-hint',
    anchor: 'assignee',
    // Ngõ cụt thật: mở ô giao việc ra mà danh sách chỉ có mỗi mình. Bắt buộc có
    // `cardModalOpen` vì neo nằm TRONG modal đó; thiếu là chọn xong không hiện
    // được gì. Không bật trên thẻ vừa tạo — lúc đó `name-card-hint` quan trọng
    // hơn, và hai bong bóng cùng một màn hình là điều đã cấm.
    when: (c) => c.cardModalOpen && !c.freshCardOpen && c.members <= 1,
    text: 'Only you can be assigned. Invite teammates from Settings → Manage workspace.',
  },
] as const;
