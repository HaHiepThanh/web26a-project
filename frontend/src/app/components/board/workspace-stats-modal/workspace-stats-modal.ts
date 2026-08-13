import { Component, computed, input, output } from '@angular/core';
import { mockBoardStats } from './board-stats.mock';
import { WorkspaceStatsPanel } from '../workspace-stats-panel/workspace-stats-panel';

/** Modal "Thống kê & Báo cáo" mở từ toolbar Board (nút cạnh Theo trạng thái / Theo ưu
 *  tiên, xem board.html). Số liệu CHỈ tính cho board đang xem (board-stats.mock.ts) —
 *  khác trang /workspace-stats vốn gộp cả workspace. Phần trình bày dùng chung component
 *  WorkspaceStatsPanel với variant="modal" để không lặp code với trang kia. */
@Component({
  selector: 'app-workspace-stats-modal',
  imports: [WorkspaceStatsPanel],
  templateUrl: './workspace-stats-modal.html',
})
export class WorkspaceStatsModal {
  readonly boardId = input.required<string>();
  readonly boardName = input<string | null>(null);

  readonly close = output<void>();

  readonly data = computed(() => mockBoardStats(this.boardId()));
}
