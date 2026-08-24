import { inject } from '@angular/core';
import { ActivityLog } from '../../models';
import { RealtimeService } from '../../services/realtime.service';
import { onBoardEvent } from '../shared/realtime.feature';

export function activityRealtimeHooks<S extends { applyRemoteLog: (log: ActivityLog) => void }>(store: S) {
  return {
    onInit() {
      const realtime = inject(RealtimeService);
      onBoardEvent(realtime, ['activity.created'], (event) => {
        store.applyRemoteLog(event.data as ActivityLog);
      });
    },
  };
}
