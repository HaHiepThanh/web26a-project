// Nhãn màu gắn cho card, phạm vi theo board (#4).
export interface Label {
  id: string; // uuid
  tenantId: string; // FK tenants.id
  boardId: string; // FK boards.id
  name: string;
  color: string; // mã hex, vd '#61bd4f'
}

// Bảng nối card <-> label (many-to-many).
export interface CardLabel {
  cardId: string; // FK cards.id
  labelId: string; // FK labels.id
}
