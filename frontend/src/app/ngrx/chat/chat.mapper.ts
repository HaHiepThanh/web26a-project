import { ApiCreatedMessage, ApiMessage, Message } from '../../models';

export function toMessage(r: ApiMessage, boardId: string): Message {
  return {
    id: r.id,
    orgId: '',
    boardId,
    userId: r.userId,
    content: r.content,
    createdAt: r.createdAt,
  };
}

export function createdToMessage(r: ApiCreatedMessage): Message {
  return {
    id: r.id,
    orgId: r.orgId,
    boardId: r.boardId,
    userId: r.userId,
    content: r.content,
    createdAt: r.createdAt,
  };
}
