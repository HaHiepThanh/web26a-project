import { Component, output } from '@angular/core';

@Component({
  selector: 'app-workspace-welcome-banner',
  templateUrl: './workspace-welcome-banner.html',
})
export class WorkspaceWelcomeBanner {
  readonly createWorkspace = output<void>();
  readonly loadSamples = output<void>();
}
