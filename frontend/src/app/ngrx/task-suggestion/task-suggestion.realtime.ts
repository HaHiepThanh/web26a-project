import { inject } from '@angular/core';
import { ChatTaskSuggestion } from '../../models';
import { RealtimeService } from '../../services/realtime.service';
import { onBoardEvent } from '../shared/realtime.feature';

/**
 * Bẫy riêng #2 (mục 5 của tài liệu): 2 sự kiện phải xử lý, `suggestion.resolved`
 * nghĩa là ai đó vừa chấp nhận/bỏ qua — chip phải tắt trên máy MỌI người.
 */
export function taskSuggestionRealtimeHooks<
  S extends {
    applyRemoteCreated: (s: ChatTaskSuggestion) => void;
    applyRemoteResolved: (id: string) => void;
  },
>(store: S) {
  return {
    onInit() {
      const realtime = inject(RealtimeService);
      onBoardEvent(realtime, ['suggestion.created'], (event) => {
        store.applyRemoteCreated(event.data as ChatTaskSuggestion);
      });
      onBoardEvent(realtime, ['suggestion.resolved'], (event) => {
        store.applyRemoteResolved((event.data as { id: string }).id);
      });
    },
  };
}
