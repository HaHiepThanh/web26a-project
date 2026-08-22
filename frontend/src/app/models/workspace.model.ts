import { WorkspaceVisibility } from './api.model';

// Workspace = nhóm board theo phòng ban (#3). Một tổ chức có nhiều workspace.
export interface Workspace {
  id: string; // uuid
  orgId: string; // FK organizations.id
  name: string;
  description: string;
  /** 'org' = mọi thành viên tổ chức thấy · 'restricted' = chỉ người trong `memberIds`. */
  visibility: WorkspaceVisibility;
  /** Rỗng khi `visibility === 'org'`. */
  memberIds: string[];
  createdBy: string;
  createdAt: string; // ISO timestamptz
}
