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
    backgroundImageUrl: row.backgroundImageUrl ?? undefined,
    meetUrl: row.meetUrl ?? undefined,
    meetCreatedBy: row.meetCreatedBy ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
  // Ảnh nền từ SERVER thắng bản localStorage.
  //
  // Trước đây ảnh nền chỉ nằm ở localStorage của người đặt, nên người khác mở
  // cùng board không thấy gì — đúng lỗi đã báo. Giờ ảnh nằm trên Supabase
  // Storage và ai cũng lấy được, còn `mergeLocalOverride` chỉ là đường lui cho
  // những board đặt nền TRƯỚC khi có endpoint upload. Ghi đè ngược lại là lỗi
  // cũ quay về ngay trên máy người đã từng đặt ảnh.
  if (base.backgroundImageUrl) return base;
  return mergeLocalOverride(base, local);
}
