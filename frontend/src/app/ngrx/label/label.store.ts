import { signalStore, signalStoreFeature, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { Label } from '../../models';
import { withErrorState } from '../shared/error.feature';
import { initialLabelState } from './label.state';
import { withLabelComputed } from './label.computed';
import { withLabelMethods } from './label.methods';
import { withLabelRealtime } from './label.realtime';

// Cùng lý do như 4 store trước: gộp producer (entities + state + lastError)
// rồi mới gắn computed, để methods/realtime — khai tường minh `state` cần —
// luôn đứng NGAY SAU một feature đã gộp sẵn.
const withLabelData = signalStoreFeature(
  withEntities<Label>(),
  withState(initialLabelState),
  withErrorState(),
);
const withLabelDataAndComputed = signalStoreFeature(withLabelData, withLabelComputed());

export const LabelStore = signalStore(
  { providedIn: 'root' },
  withLabelDataAndComputed,
  withLabelMethods(),
  withLabelRealtime(),
);
