import { ApiBoard, Board, BoardBackground } from '../../models';
import { LocalBoardOverride, mergeLocalOverride } from './board.local-image.util';

export function toBoard(row: ApiBoard, local: LocalBoardOverride | undefined): Board {
  const base: Board = {
    id: row.id,
    orgId: row.orgId,
    workspaceId: row.workspaceId,
    name: row.name,
    visibility: row.visibility,
    background: (row.background as BoardBackground | null) ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
  return mergeLocalOverride(base, local);
}
