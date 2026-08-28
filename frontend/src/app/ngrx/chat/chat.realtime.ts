import { inject } from '@angular/core';
import { ApiMessage, Message } from '../../models';
import { RealtimeService } from '../../services/realtime.service';
import { onBoardEvent } from '../shared/realtime.feature';
import { toMessage } from './chat.mapper';

export function chatRealtimeHooks<
  S extends {
    applyIncoming: (message: Message) => void;
    applyUpdated: (message: Message) => void;
  },
>(store: S) {
  return {
    onInit() {
      const realtime = inject(RealtimeService);
      onBoardEvent(realtime, ['chat.message'], (event) => {
        store.applyIncoming(toMessage(event.data as ApiMessage));
      });
      // Sửa và thu hồi dùng chung một sự kiện — cả hai đều chỉ là "dòng này vừa
      // đổi". Thiếu nhánh này thì máy người khác vẫn hiện nội dung cũ tới khi F5.
      onBoardEvent(realtime, ['chat.message.updated'], (event) => {
        store.applyUpdated(toMessage(event.data as ApiMessage));
      });
    },
  };
}
