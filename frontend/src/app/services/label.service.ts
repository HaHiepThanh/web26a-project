import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Label } from '../models';

/** Nhãn màu theo board + gắn/gỡ nhãn cho card (#4). */
@Injectable({ providedIn: 'root' })
export class LabelService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  readonly labels = signal<Label[]>([]); // nhãn của board hiện tại

  // TODO: lấy nhãn của board.
  async loadLabels(boardId: string): Promise<void> {}

  // TODO: tạo nhãn (name + color hex).
  async createLabel(boardId: string, name: string, color: string): Promise<Label | null> {
    return null;
  }

  // TODO: gắn nhãn vào card (insert card_labels).
  async attachLabel(cardId: string, labelId: string): Promise<void> {}

  // TODO: gỡ nhãn khỏi card.
  async detachLabel(cardId: string, labelId: string): Promise<void> {}
}
