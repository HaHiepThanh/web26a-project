import { ApiCard, Card } from '../../models';

/** Backend trả 1 mảng phẳng mọi thẻ của board; giao diện cần gom theo cột (xem `card.computed.ts`). */
export function toCard(r: ApiCard): Card {
  return {
    id: r.id,
    orgId: r.orgId,
    listId: r.listId,
    title: r.title,
    description: r.description ?? undefined,
    priority: r.priority,
    assigneeId: r.assigneeId ?? undefined,
    dueDate: r.dueDate ?? undefined,
    completedAt: r.completedAt ?? undefined,
    position: r.position,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
