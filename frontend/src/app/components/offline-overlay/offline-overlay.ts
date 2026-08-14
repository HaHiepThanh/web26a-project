import { Component, inject } from '@angular/core';
import { OfflineService } from '../../services/offline.service';

/** Overlay toàn app khi mất kết nối mạng thật (navigator.onLine), tự ẩn khi có mạng lại. */
@Component({
  selector: 'app-offline-overlay',
  imports: [],
  templateUrl: './offline-overlay.html',
  styleUrl: './offline-overlay.css',
})
export class OfflineOverlay {
  private readonly offlineService = inject(OfflineService);
  readonly offline = this.offlineService.offline;
}
