import { signalStore, signalStoreFeature, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { Card } from '../../models';
import { withErrorState } from '../shared/error.feature';
import { initialCardState } from './card.state';
import { withCardComputed } from './card.computed';
import { withCardMethods } from './card.methods';
import { withCardRealtime } from './card.realtime';

// Gộp các mảnh "producer" (entities + state + lastError) thành MỘT feature đã
// giải xong trước, rồi mới gắn `withCardComputed`, để `withCardMethods`/
// `withCardRealtime` — hai mảnh khai tường minh `state` cần — luôn đứng NGAY SAU
// một feature đã gộp sẵn. Xa hơn 1 bước là TypeScript đánh rơi phần state tự khai
// báo trong lúc suy luận generic của `signalStore` (giới hạn của compiler với
// chuỗi feature dài, không phải lỗi logic) — đây là cách né an toàn, không đổi
// hành vi runtime.
const withCardData = signalStoreFeature(
  withEntities<Card>(),
  withState(initialCardState),
  withErrorState(),
);
const withCardDataAndComputed = signalStoreFeature(withCardData, withCardComputed());

export const CardStore = signalStore(
  { providedIn: 'root' },
  withCardDataAndComputed,
  withCardMethods(),
  withCardRealtime(),
);
