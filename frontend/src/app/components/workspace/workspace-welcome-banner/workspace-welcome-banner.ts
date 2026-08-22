import { Component, input, output } from '@angular/core';
import { LucideRocket, LucideSparkles, LucideZap } from '@lucide/angular';

@Component({
  selector: 'app-workspace-welcome-banner',
  imports: [LucideRocket, LucideSparkles, LucideZap],
  templateUrl: './workspace-welcome-banner.html',
})
export class WorkspaceWelcomeBanner {
  /** false = thành viên thường → ẩn các nút quản lý (backend vẫn chặn thật). */
  readonly canManage = input<boolean>(true);

  readonly createWorkspace = output<void>();
  readonly loadSamples = output<void>();
}
