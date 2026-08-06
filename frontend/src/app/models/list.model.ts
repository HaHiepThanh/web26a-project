// List = cột trong board (vd: To Do / Doing / Done) (#4).
export interface List {
  id: string; // uuid
  tenantId: string; // FK tenants.id
  boardId: string; // FK boards.id
  name: string;
  color?: string; // hex, nullable — cột mới (CLAUDE.md #2), xem migrations/0001_*.sql
  position: number; // float — dùng để chèn giữa 2 vị trí khi kéo thả
  createdAt: string; // ISO timestamptz
}
