import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card, CardPriority } from '../../models';
import { CardService } from '../../services/card.service';
import { ListService } from '../../services/list.service';

const PRIORITY_LABEL: Record<CardPriority, string> = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };
const PRIORITY_BADGE: Record<CardPriority, string> = { high: 'badge-error badge-soft', medium: 'badge-warning badge-soft', low: 'badge-ghost' };
const DUE_SOON_WINDOW_DAYS = 3;

/**
 * Trang tổng quan (appRequirement #8, bonus) — chỉ làm đúng phần mục 10 (🟡) yêu cầu:
 * "Sắp đến hạn" + "Việc của tôi". Dữ liệu lấy từ CardService/ListService (singleton,
 * chỉ có dữ liệu SAU KHI đã mở ít nhất 1 board trong phiên — demo dùng dữ liệu giả
 * tại chỗ, chưa có API tổng hợp nhiều board thật).
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly cardService = inject(CardService);
  private readonly listService = inject(ListService);

  readonly boardId = this.cardService.loadedBoardId;
  readonly priorityLabel = PRIORITY_LABEL;
  readonly priorityBadge = PRIORITY_BADGE;
  private readonly today = new Date().toISOString().slice(0, 10);

  private readonly listNameById = computed(() => {
    const map: Record<string, string | undefined> = {};
    for (const l of this.listService.lists()) map[l.id] = l.name;
    return map;
  });

  readonly myTasks = computed(() => [...this.cardService.myCards()].sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99')));

  readonly dueSoonTasks = computed(() => {
    const soonLimit = new Date(this.today);
    soonLimit.setDate(soonLimit.getDate() + DUE_SOON_WINDOW_DAYS);
    const soonLimitStr = soonLimit.toISOString().slice(0, 10);
    return this.myTasks().filter((c) => c.dueDate && c.dueDate <= soonLimitStr);
  });

  listNameFor(card: Card): string {
    return this.listNameById()[card.listId] ?? '—';
  }

  isOverdue(card: Card): boolean {
    return !!card.dueDate && card.dueDate < this.today;
  }

  trackByCardId(_: number, c: Card): string {
    return c.id;
  }
}
