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
 *   | Lặp lại | chạy lại được từ Cài đặt | hiện đúng một lần rồi thôi vĩnh viễn |
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
}

export interface CoachMark {
  /** Ghi vào `seenCoachMarks`; đổi id là coi như một mẩu chỉ dẫn mới. */
  id: string;
  /** `data-tour` của phần tử được chỉ vào. */
  anchor: string;
  /** MỘT câu. Dài hơn là thành bài giảng, mà người ta đang làm việc dở. */
  text: string;
  /** Điều kiện bật. Đọc là hiểu ngay vấn đề nó đang giải. */
  when: (c: CoachContext) => boolean;
}

/**
 * Thứ tự trong mảng là thứ tự ưu tiên khi nhiều cái cùng đủ điều kiện — mỗi
 * phiên chỉ được hiện một cái, nên cái đứng trước thắng.
 *
 * Cố ý chỉ có bốn. Danh sách đặc tả còn stats modal, bộ lọc đã lưu, mời thành
 * viên, đổi theme, link mời — nhưng bật hết một lúc thì thành mưa bong bóng,
 * đúng thứ ba luật chống phiền sinh ra để tránh. Thêm dần khi biết cái nào thật
 * sự có ích.
 */
export const COACH_MARKS: readonly CoachMark[] = [
  {
    id: 'filter-hint',
    anchor: 'filter',
    // 12 thẻ: qua ngưỡng này thì một màn hình không còn nhìn hết được nữa, tức
    // là lúc "tìm một thẻ" bắt đầu tốn công. Trước đó Filter chưa giải quyết gì.
    when: (c) => c.cards > 12,
    text: 'Board getting busy? Filter by assignee, label, priority or due date.',
  },
  {
    id: 'layout-hint',
    anchor: 'layout',
    // Nhiều cột + đang ở chế độ cột + phải cuộn ngang = đúng lúc Row View đáng
    // giá. Gợi ý khi mới có hai cột thì họ chưa thấy vấn đề đâu mà đổi.
    when: (c) => c.lists >= 4 && c.layout === 'column' && c.overflowsWidth,
    text: 'Too much sideways scrolling? Row View stacks the columns instead.',
  },
  {
    id: 'minimap-hint',
    anchor: 'minimap',
    when: (c) => c.overflowsWidth && c.lists >= 3,
    text: 'The mini map shows the whole board — drag it to jump around.',
  },
  {
    id: 'viewers-hint',
    anchor: 'viewers',
    // Không giải thích thì người ta tưởng lỗi: tự nhiên có mấy khuôn mặt lạ hiện
    // ra ở đầu board, và thẻ thì tự di chuyển.
    when: (c) => c.viewers >= 2,
    text: 'Someone else is on this board right now. Their changes appear as they happen.',
  },
] as const;
