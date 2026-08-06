// [BONUS #4] Mục checklist nhỏ bên trong một card.
export interface ChecklistItem {
  id: string; // uuid
  cardId: string; // FK cards.id
  content: string;
  isDone: boolean; // default false
  position: number; // float
}
