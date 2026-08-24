import { ApiList, List } from '../../models';

export function toList(r: ApiList): List {
  return {
    id: r.id,
    orgId: r.orgId,
    boardId: r.boardId,
    name: r.name,
    position: r.position,
    createdAt: r.createdAt,
  };
}
