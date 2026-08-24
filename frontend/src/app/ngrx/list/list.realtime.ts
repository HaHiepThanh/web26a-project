import { inject } from '@angular/core';
import { ApiList } from '../../models';
import { RealtimeService } from '../../services/realtime.service';
import { onBoardEvent } from '../shared/realtime.feature';

type Store = {
  applyRemote: (r: ApiList) => void;
  applyRemoteDeleted: (id: string) => void;
};

/** Trả về object hook cho `withHooks((store) => listRealtimeHooks(store))`. */
export function listRealtimeHooks<S extends Store>(store: S) {
  return {
    onInit() {
      const realtime = inject(RealtimeService);
      onBoardEvent(realtime, ['list.created', 'list.updated'], (event) => {
        store.applyRemote(event.data as ApiList);
      });
      onBoardEvent(realtime, ['list.deleted'], (event) => {
        store.applyRemoteDeleted((event.data as { id: string }).id);
      });
    },
  };
}
