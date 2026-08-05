// Workspace = nhóm board theo phòng ban (#3). Một tenant có nhiều workspace.
export interface Workspace {
  id: string; // uuid
  tenantId: string; // FK tenants.id
  name: string;
  createdAt: string; // ISO timestamptz
}
