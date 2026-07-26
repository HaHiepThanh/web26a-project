import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Card } from '../models';

/** CRUD card + kéo thả giữa/ trong list (#4). */
@Injectable({ providedIn: 'root' })
export class CardService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  // Map listId -> cards, tiện render theo cột. Hoặc học viên có thể chọn cấu trúc khác.
  readonly cardsByList = signal<Record<string, Card[]>>({});

  // TODO: lấy toàn bộ card của board (rồi group theo listId).
  async loadCards(boardId: string): Promise<void> {}

  // TODO: tạo card trong list.
  async createCard(listId: string, title: string): Promise<Card | null> {
    return null;
  }

  // TODO: cập nhật chi tiết card (title, description, assignee, dueDate...).
  async updateCard(id: string, changes: Partial<Card>): Promise<void> {}

  // TODO: xoá card (bonus: soft delete rồi khôi phục).
  async deleteCard(id: string): Promise<void> {}

  // TODO: chuyển card sang list khác và/hoặc đổi position (kéo thả).
  async moveCard(cardId: string, toListId: string, newPosition: number): Promise<void> {}
}
