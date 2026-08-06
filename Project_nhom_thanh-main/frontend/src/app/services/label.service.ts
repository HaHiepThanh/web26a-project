import { Injectable, signal } from '@angular/core';
import { Label } from '../models';

let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

/** Bảng màu cho phép khi tự tạo nhãn (#5) — loại trừ đỏ/vàng/xám vì 3 màu đó đã
 *  khoá riêng cho mức ưu tiên (#4), tránh nhầm lẫn ý nghĩa giữa nhãn và cờ ưu tiên. */
export const LABEL_COLOR_PALETTE = ['#2563eb', '#059669', '#7c3aed', '#0d9488', '#db2777', '#4f46e5', '#0891b2', '#65a30d'];

function mockLabels(boardId: string): Label[] {
  const seed: [string, string][] = [
    ['Bug', '#2563eb'],
    ['Khách VIP', '#7c3aed'],
    ['Cần review', '#0d9488'],
    ['Feature mới', '#059669'],
  ];
  return seed.map(([name, color]) => ({ id: mockId('label'), tenantId: 'tenant-demo', boardId, name, color }));
}

/** Nhãn màu theo board + gắn/gỡ nhiều nhãn cùng lúc cho 1 thẻ (#5). Người dùng tự
 *  tạo nhãn (tên + màu, loại trừ 3 màu priority đã khoá ở #4). */
@Injectable({ providedIn: 'root' })
export class LabelService {
  readonly labels = signal<Label[]>([]); // nhãn của board hiện tại
  /** cardId -> danh sách labelId (many-to-many, đúng bảng card_labels). */
  readonly cardLabelIds = signal<Record<string, string[]>>({});

  private loadedBoardId: string | null = null;

  async loadLabels(boardId: string): Promise<void> {
    if (this.loadedBoardId === boardId) return;
    this.loadedBoardId = boardId;
    this.labels.set(mockLabels(boardId));
  }

  async createLabel(boardId: string, name: string, color: string): Promise<Label | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const label: Label = { id: mockId('label'), tenantId: 'tenant-demo', boardId, name: trimmed, color };
    this.labels.update((all) => [...all, label]);
    return label;
  }

  /** Ghi đè toàn bộ danh sách nhãn của 1 thẻ (dùng khi tạo thẻ hoặc lưu picker). */
  setCardLabels(cardId: string, labelIds: string[]): void {
    this.cardLabelIds.update((map) => ({ ...map, [cardId]: labelIds }));
  }

  async attachLabel(cardId: string, labelId: string): Promise<void> {
    this.cardLabelIds.update((map) => {
      const current = map[cardId] ?? [];
      if (current.includes(labelId)) return map;
      return { ...map, [cardId]: [...current, labelId] };
    });
  }

  async detachLabel(cardId: string, labelId: string): Promise<void> {
    this.cardLabelIds.update((map) => {
      const current = map[cardId] ?? [];
      if (!current.includes(labelId)) return map;
      return { ...map, [cardId]: current.filter((id) => id !== labelId) };
    });
  }

  toggleCardLabel(cardId: string, labelId: string): void {
    const current = this.cardLabelIds()[cardId] ?? [];
    if (current.includes(labelId)) void this.detachLabel(cardId, labelId);
    else void this.attachLabel(cardId, labelId);
  }
}
