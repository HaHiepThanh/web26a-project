import { signalStore, signalStoreFeature, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { ChecklistItem } from '../../models';
import { withErrorState } from '../shared/error.feature';
import { initialChecklistState } from './checklist.state';
import { withChecklistComputed } from './checklist.computed';
import { withChecklistMethods } from './checklist.methods';
import { withChecklistRealtime } from './checklist.realtime';

// Cùng lý do như CardStore: gộp producer (entities + state + lastError) rồi mới
// gắn computed, để methods/realtime — khai tường minh `state` cần — luôn đứng
// NGAY SAU một feature đã gộp sẵn (xem ghi chú suy luận TS trong card.store.ts).
const withChecklistData = signalStoreFeature(
  withEntities<ChecklistItem>(),
  withState(initialChecklistState),
  withErrorState(),
);
const withChecklistDataAndComputed = signalStoreFeature(withChecklistData, withChecklistComputed());

export const ChecklistStore = signalStore(
  { providedIn: 'root' },
  withChecklistDataAndComputed,
  withChecklistMethods(),
  withChecklistRealtime(),
);
