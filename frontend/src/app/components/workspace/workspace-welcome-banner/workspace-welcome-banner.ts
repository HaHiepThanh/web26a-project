import { Component, output } from '@angular/core';
import { LucideRocket, LucideSparkles, LucideZap } from '@lucide/angular';

@Component({
  selector: 'app-workspace-welcome-banner',
  imports: [LucideRocket, LucideSparkles, LucideZap],
  templateUrl: './workspace-welcome-banner.html',
})
export class WorkspaceWelcomeBanner {
  readonly createWorkspace = output<void>();
  readonly loadSamples = output<void>();
}
