// [BONUS #4] Mục checklist nhỏ bên trong một card.
export interface ChecklistItem {
  id: string; // uuid
  cardId: string; // FK cards.id
  content: string;
  isDone: boolean; // default false
  position: number; // float
}

/** Tiến độ checklist của 1 thẻ — dùng để vẽ thanh "3/5" ngoài mặt thẻ. */
export interface ChecklistProgress {
  done: number;
  total: number;
}
