import { signalStore, signalStoreFeature, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { Comment } from '../../models';
import { withErrorState } from '../shared/error.feature';
import { initialCommentState } from './comment.state';
import { withCommentComputed } from './comment.computed';
import { withCommentMethods } from './comment.methods';
import { withCommentRealtime } from './comment.realtime';

// Cùng lý do như CardStore/ChecklistStore: gộp producer (entities + state +
// lastError) rồi mới gắn computed, để methods/realtime — khai tường minh
// `state` cần — luôn đứng NGAY SAU một feature đã gộp sẵn.
const withCommentData = signalStoreFeature(
  withEntities<Comment>(),
  withState(initialCommentState),
  withErrorState(),
);
const withCommentDataAndComputed = signalStoreFeature(withCommentData, withCommentComputed());

export const CommentStore = signalStore(
  { providedIn: 'root' },
  withCommentDataAndComputed,
  withCommentMethods(),
  withCommentRealtime(),
);
