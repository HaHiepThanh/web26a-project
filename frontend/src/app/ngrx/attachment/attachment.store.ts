import { signalStore, signalStoreFeature, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { Attachment } from '../../models';
import { withErrorState } from '../shared/error.feature';
import { initialAttachmentState } from './attachment.state';
import { withAttachmentComputed } from './attachment.computed';
import { withAttachmentMethods } from './attachment.methods';
import { withAttachmentRealtime } from './attachment.realtime';

// Cùng lý do như CardStore/ChecklistStore/CommentStore: gộp producer (entities
// + state + lastError) rồi mới gắn computed, để methods/realtime — khai tường
// minh `state` cần — luôn đứng NGAY SAU một feature đã gộp sẵn.
const withAttachmentData = signalStoreFeature(
  withEntities<Attachment>(),
  withState(initialAttachmentState),
  withErrorState(),
);
const withAttachmentDataAndComputed = signalStoreFeature(withAttachmentData, withAttachmentComputed());

export const AttachmentStore = signalStore(
  { providedIn: 'root' },
  withAttachmentDataAndComputed,
  withAttachmentMethods(),
  withAttachmentRealtime(),
);
