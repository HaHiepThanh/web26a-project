import { ApiLabel, Label } from '../../models';

export function toLabel(r: ApiLabel): Label {
  return { id: r.id, orgId: r.orgId, boardId: r.boardId, name: r.name, color: r.color };
}
