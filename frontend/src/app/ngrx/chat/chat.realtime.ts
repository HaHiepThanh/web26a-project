import { inject } from '@angular/core';
import { ApiCreatedMessage, Message } from '../../models';
import { RealtimeService } from '../../services/realtime.service';
import { onBoardEvent } from '../shared/realtime.feature';
import { createdToMessage } from './chat.mapper';

export function chatRealtimeHooks<S extends { applyIncoming: (message: Message) => void }>(store: S) {
  return {
    onInit() {
      const realtime = inject(RealtimeService);
      onBoardEvent(realtime, ['chat.message'], (event) => {
        store.applyIncoming(createdToMessage(event.data as ApiCreatedMessage));
      });
    },
  };
}
