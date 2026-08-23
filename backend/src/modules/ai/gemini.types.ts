/** Một thẻ do AI đề xuất. Khớp field với `Card` để tạo thẳng được, không phải map. */
export interface SuggestedCard {
  title: string;
  description?: string;
  /** Firebase uid — ĐÃ được đối chiếu với danh sách thành viên board. */
  assigneeId?: string;
  /** 'YYYY-MM-DD'. */
  dueDate?: string;
  /** Cột sẽ thêm thẻ vào — đã đối chiếu với các cột thật của board. */
  listId?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface DetectTasksResult {
  isTask: boolean;
  /** 0..1 — độ tự tin của model. Dưới ngưỡng thì bỏ, không làm phiền người dùng. */
  confidence: number;
  cards: SuggestedCard[];
}

/** Thông tin gửi kèm để model hiểu ngữ cảnh mà suy ra người phụ trách / hạn. */
export interface DetectTasksInput {
  /** Nội dung tin nhắn cần phân tích. */
  content: string;
  /** Người GỬI tin — bắt buộc, để hiểu "tao"/"mình"/"I" trỏ vào ai. */
  sender: { id: string; displayName: string };
  /** Vài tin gần nhất, cũ → mới. Dùng để nối được ngữ cảnh nhiều câu. */
  recent: { displayName: string; content: string }[];
  members: { id: string; displayName: string }[];
  lists: { id: string; name: string }[];
  /** Hôm nay theo giờ Việt Nam, 'YYYY-MM-DD'. */
  today: string;
}
