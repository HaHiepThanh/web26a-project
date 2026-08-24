import { inject } from '@angular/core';
import { ApiBoard } from '../../models';
import { RealtimeService } from '../../services/realtime.service';
import { onBoardEvent } from '../shared/realtime.feature';

export function boardRealtimeHooks<S extends { applyRemoteBoard: (r: ApiBoard) => void }>(store: S) {
  return {
    onInit() {
      const realtime = inject(RealtimeService);
      onBoardEvent(realtime, ['board.updated'], (event) => {
        store.applyRemoteBoard(event.data as ApiBoard);
      });
    },
  };
}
