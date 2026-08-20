// Workspace = nhóm board theo phòng ban (#3). Một tổ chức có nhiều workspace.
export interface Workspace {
  id: string; // uuid
  orgId: string; // FK organizations.id
  name: string;
  createdAt: string; // ISO timestamptz
}
