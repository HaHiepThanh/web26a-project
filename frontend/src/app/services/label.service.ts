import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { describeError } from './api-error.util';
import {
  ApiLabel,
  Label,
} from '../models';
/** Bảng màu cho phép khi tự tạo nhãn (#5) — loại trừ đỏ/vàng/xám vì 3 màu đó đã
 *  khoá riêng cho mức ưu tiên (#4), tránh nhầm lẫn ý nghĩa giữa nhãn và cờ ưu tiên. */
export const LABEL_COLOR_PALETTE = ['#2563eb', '#059669', '#7c3aed', '#0d9488', '#db2777', '#4f46e5', '#0891b2', '#65a30d'];

/**
 * Nhãn màu theo board + gắn/gỡ nhãn cho thẻ (#5) — GỌI BACKEND THẬT.
 *
 * `cardLabelIds` (thẻ nào đang có nhãn nào) hiện chỉ giữ trong bộ nhớ: backend
 * chưa có endpoint đọc `card_labels` của cả board, mà `GET /cards` là phần của
 * Hoàng chưa xong. Việc GẮN và GỠ thì đã ghi thật xuống database.
 */
@Injectable({ providedIn: 'root' })
export class LabelService {
  private readonly api = inject(ApiService);

  readonly labels = signal<Label[]>([]); // nhãn của board hiện tại
  /** cardId -> danh sách labelId (many-to-many, đúng bảng card_labels). */
  readonly cardLabelIds = signal<Record<string, string[]>>({});
  readonly lastError = signal<{ id: number; message: string } | null>(null);
  private errorSeq = 0;

  private loadedBoardId: string | null = null;

  private toLabel(r: ApiLabel): Label {
    return { id: r.id, orgId: r.orgId, boardId: r.boardId, name: r.name, color: r.color };
  }

  private fail(message: string): void {
    this.errorSeq++;
    this.lastError.set({ id: this.errorSeq, message });
  }

  /** Áp nhãn mới nhận từ WebSocket — có rồi thì ghi đè, chưa có thì thêm. */
  applyRemoteLabel(r: ApiLabel): void {
    const label = this.toLabel(r);
    this.labels.update((all) =>
      all.some((l) => l.id === label.id) ? all.map((l) => (l.id === label.id ? label : l)) : [...all, label],
    );
  }

  applyRemoteAttach(cardId: string, labelId: string): void {
    this.cardLabelIds.update((map) => {
      const current = map[cardId] ?? [];
      return current.includes(labelId) ? map : { ...map, [cardId]: [...current, labelId] };
    });
  }

  applyRemoteDetach(cardId: string, labelId: string): void {
    this.cardLabelIds.update((map) => {
      const current = map[cardId] ?? [];
      return current.includes(labelId) ? { ...map, [cardId]: current.filter((id) => id !== labelId) } : map;
    });
  }

  async loadLabels(boardId: string, force = false): Promise<void> {
    if (!boardId) {
      this.labels.set([]);
      return;
    }
    if (!force && this.loadedBoardId === boardId) return;
    this.loadedBoardId = boardId;
    try {
      const rows = await this.api.get<ApiLabel[]>(`/labels?boardId=${boardId}`);
      this.labels.set(rows.map((r) => this.toLabel(r)));
    } catch (e) {
      this.labels.set([]);
      this.fail(describeError(e, 'Không tải được danh sách nhãn.'));
    }
  }

  async createLabel(boardId: string, name: string, color: string): Promise<Label | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const row = await this.api.post<ApiLabel>('/labels', { boardId, name: trimmed, color });
      const label = this.toLabel(row);
      this.labels.update((all) => [...all, label]);
      return label;
    } catch (e) {
      this.fail(describeError(e, 'Không tạo được nhãn.'));
      return null;
    }
  }

  /** Ghi đè toàn bộ danh sách nhãn của 1 thẻ (dùng khi lưu picker) — gọi API cho
   *  phần chênh lệch, không xoá sạch rồi gắn lại (thừa request và dễ mất dữ liệu). */
  async setCardLabels(cardId: string, labelIds: string[]): Promise<void> {
    const current = this.cardLabelIds()[cardId] ?? [];
    const themVao = labelIds.filter((id) => !current.includes(id));
    const boDi = current.filter((id) => !labelIds.includes(id));
    await Promise.all([
      ...themVao.map((id) => this.attachLabel(cardId, id)),
      ...boDi.map((id) => this.detachLabel(cardId, id)),
    ]);
  }

  async attachLabel(cardId: string, labelId: string): Promise<void> {
    const previous = this.cardLabelIds();
    this.cardLabelIds.update((map) => {
      const current = map[cardId] ?? [];
      if (current.includes(labelId)) return map;
      return { ...map, [cardId]: [...current, labelId] };
    });
    try {
      await this.api.post(`/labels/cards/${cardId}/${labelId}`, {});
    } catch (e) {
      this.cardLabelIds.set(previous);
      this.fail(describeError(e, 'Không gắn được nhãn.'));
    }
  }

  async detachLabel(cardId: string, labelId: string): Promise<void> {
    const previous = this.cardLabelIds();
    this.cardLabelIds.update((map) => {
      const current = map[cardId] ?? [];
      if (!current.includes(labelId)) return map;
      return { ...map, [cardId]: current.filter((id) => id !== labelId) };
    });
    try {
      await this.api.delete(`/labels/cards/${cardId}/${labelId}`);
    } catch (e) {
      this.cardLabelIds.set(previous);
      this.fail(describeError(e, 'Không gỡ được nhãn.'));
    }
  }

  toggleCardLabel(cardId: string, labelId: string): void {
    const current = this.cardLabelIds()[cardId] ?? [];
    if (current.includes(labelId)) void this.detachLabel(cardId, labelId);
    else void this.attachLabel(cardId, labelId);
  }
}
