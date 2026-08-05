// Board thuộc một workspace (#3).
export type BoardVisibility = 'public' | 'restricted';

export interface Board {
  id: string; // uuid
  tenantId: string; // FK tenants.id
  workspaceId: string; // FK workspaces.id
  name: string;
  visibility: BoardVisibility; // default 'public'
  createdBy: string; // FK auth.users.id
  createdAt: string; // ISO timestamptz
}

// Thành viên được phép xem board khi visibility = 'restricted' (#3, bonus).
export interface BoardMember {
  boardId: string; // FK boards.id
  userId: string; // FK auth.users.id
}
