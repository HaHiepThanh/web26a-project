import { signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { Message } from '../../models';
import { withErrorState } from '../shared/error.feature';
import { initialChatState } from './chat.state';
import { chatComputed } from './chat.computed';
import { chatMethods } from './chat.methods';
import { chatRealtimeHooks } from './chat.realtime';

/** Thay `ChatService` cũ. Xem `ngrx/list/list.store.ts` về lý do ghép các mảnh
 *  trực tiếp thay vì tự bọc `signalStoreFeature` riêng cho từng file. */
export const ChatStore = signalStore(
  { providedIn: 'root' },
  withEntities<Message>(),
  withState(initialChatState),
  withErrorState(),
  withComputed((store) => chatComputed(store)),
  withMethods((store) => chatMethods(store)),
  withHooks((store) => chatRealtimeHooks(store)),
);
