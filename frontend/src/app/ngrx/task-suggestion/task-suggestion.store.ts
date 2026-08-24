import { effect, inject, untracked } from '@angular/core';
import { signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { ChatTaskSuggestion } from '../../models';
import { withErrorState } from '../shared/error.feature';
import { RouteContextStore } from '../route-context/route-context.store';
import { initialTaskSuggestionState } from './task-suggestion.state';
import { taskSuggestionComputed } from './task-suggestion.computed';
import { taskSuggestionMethods } from './task-suggestion.methods';
import { taskSuggestionRealtimeHooks } from './task-suggestion.realtime';

/** Thay `TaskSuggestionService` cũ. Xem `ngrx/list/list.store.ts` về lý do
 *  ghép các mảnh trực tiếp thay vì tự bọc `signalStoreFeature` riêng cho từng file. */
export const TaskSuggestionStore = signalStore(
  { providedIn: 'root' },
  withEntities<ChatTaskSuggestion>(),
  withState(initialTaskSuggestionState),
  withErrorState(),
  withComputed((store) => taskSuggestionComputed(store)),
  withMethods((store) => taskSuggestionMethods(store)),
  withHooks((store) => taskSuggestionRealtimeHooks(store)),
  // Gợi ý AI còn đang chờ — nạp lại theo board đang mở để F5 không mất (trước đây
  // board.ts tự gọi tay trong `bootstrap()`).
  withHooks((store) => ({
    onInit() {
      const ctx = inject(RouteContextStore);
      effect(() => {
        const boardId = ctx.activeBoardId();
        if (boardId) untracked(() => store.loadSuggestions(boardId));
      });
    },
  })),
);
