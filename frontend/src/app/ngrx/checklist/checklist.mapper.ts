import { ApiChecklistItem, ChecklistItem } from '../../models';

export function toItem(r: ApiChecklistItem): ChecklistItem {
  return {
    id: r.id,
    cardId: r.cardId,
    content: r.content,
    isDone: r.isDone,
    position: r.position,
  };
}
