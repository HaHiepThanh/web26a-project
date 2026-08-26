import { inject } from '@angular/core';
import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { EntityState, EntityProps, setAllEntities, upsertEntity, removeEntity } from '@ngrx/signals/entities';
import { ApiCard, Card, CardPriority, CreateCardInput } from '../../models';
import { ApiService } from '../../services/api.service';
import { describeError } from '../../services/api-error.util';
import { toCard } from './card.mapper';
import { CardExtraState } from './card.state';
import { withId, withoutId, midpoint } from '../shared/entity.util';

/** 5 trường mà PATCH /cards/:id nhận. Khai tường minh thay vì Record<string, unknown>
 *  để gõ sai tên trường là TypeScript báo ngay, không phải chờ backend trả 400.
 *
 *  Ba trường xoá được mang thêm `null` — đó là cách DUY NHẤT nói với backend
 *  "xoá giá trị này đi": `undefined` sẽ bị `JSON.stringify` bỏ khỏi body, còn
 *  backend chỉ ghi khi `!== undefined`, nên trường vắng mặt nghĩa là "giữ
 *  nguyên". `null` đi qua được `@IsOptional()` và ghi thẳng NULL xuống cột. */
interface CardPatch {
  title?: string;
  description?: string | null;
  priority?: CardPriority;
  dueDate?: string | null;
  assigneeId?: string | null;
  completedAt?: string | null;
}

/**
 * Thay đổi gửi vào `updateCard`.
 *
 * Khác `Partial<Card>` ở đúng bốn trường xoá được: chúng nhận `null` để phân biệt
 * "không đụng tới" (vắng mặt) với "xoá đi" (`null`) — `Card` không diễn đạt được
 * điều đó vì các trường ấy khai `?: string`, mà `undefined` lại đang mang nghĩa
 * "không đụng tới".
 */
export type CardChanges = Omit<Partial<Card>, 'description' | 'dueDate' | 'assigneeId' | 'completedAt'> & {
  description?: string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  completedAt?: string | null;
};

/**
 * CRUD card + kéo thả giữa/trong list — GỌI BACKEND THẬT.
 *
 * Kéo-thả giữ optimistic update: đổi vị trí trên màn hình NGAY rồi mới gọi API,
 * hỏng thì trả về trạng thái cũ. Hoàn tác luôn nhắm ĐÚNG MỘT entity (`upsertEntity`
 * đúng id), không `set()` lại cả collection — một sự kiện WebSocket của người
 * khác có thể lọt vào giữa lúc chờ API, ghi đè cả cụm sẽ xoá mất thay đổi đó.
 */
export function withCardMethods() {
  return signalStoreFeature(
    {
      state: type<EntityState<Card> & CardExtraState>(),
      props: type<EntityProps<Card>>(),
      methods: type<{ fail(message: string): void }>(),
    },
    withMethods((store, api = inject(ApiService)) => ({
      async loadCards(boardId: string, force = false): Promise<void> {
        if (!boardId) {
          patchState(store, setAllEntities<Card>([]), { loadedBoardId: null });
          return;
        }
        if (!force && store.loadedBoardId() === boardId) return;
        patchState(store, { loadedBoardId: boardId });
        try {
          const rows = await api.get<ApiCard[]>(`/cards?boardId=${boardId}`);
          patchState(store, setAllEntities(rows.map(toCard)));
        } catch (e) {
          patchState(store, setAllEntities<Card>([]));
          store.fail(describeError(e, 'Failed to load cards.'));
        }
      },

      async createCard(listId: string, input: CreateCardInput): Promise<Card | null> {
        const title = input.title.trim();
        if (!title) return null;

        try {
          // POST /cards chỉ nhận listId + title; id và position do SERVER cấp.
          const row = await api.post<ApiCard>('/cards', { listId, title });

          // Các trường còn lại gửi ở bước hai. Hỏng thì thẻ vẫn tồn tại với giá trị
          // mặc định — báo cho người dùng chứ không nuốt lỗi.
          const patch: CardPatch = {};
          if (input.description?.trim()) patch.description = input.description.trim();
          if (input.priority && input.priority !== 'medium') patch.priority = input.priority;
          if (input.assigneeId) patch.assigneeId = input.assigneeId;
          if (input.dueDate) patch.dueDate = input.dueDate;

          let final = row;
          if (Object.keys(patch).length > 0) {
            try {
              final = await api.patch<ApiCard>(`/cards/${row.id}`, patch);
            } catch {
              store.fail('Card created but some details failed to save.');
            }
          }

          // Upsert theo id, không phải thêm mù quáng: sự kiện WebSocket `card.created`
          // có thể đã về trước khi POST trả lời.
          patchState(store, upsertEntity(toCard(final)));
          return toCard(final);
        } catch (e) {
          store.fail(describeError(e, 'Failed to create card.'));
          return null;
        }
      },

      async updateCard(id: string, changes: CardChanges): Promise<void> {
        const before = store.entityMap()[id];
        if (!before) return;

        // Cập nhật giao diện trước cho mượt, hỏng thì trả lại nguyên trạng — chỉ
        // đúng thẻ này, không đụng thẻ khác.
        //
        // `null` là ngôn ngữ nói chuyện với BACKEND ("xoá cột này"), không phải
        // hình dạng dữ liệu trong máy: `Card` dùng `undefined` cho "không có".
        // Đổi về `undefined` ở đây để mọi chỗ đọc thẻ (`!c.assigneeId`, badge hạn,
        // bộ lọc "Chưa gán") không phải học thêm một dạng rỗng thứ hai.
        patchState(
          store,
          upsertEntity({
            ...before,
            ...changes,
            ...(changes.description === null ? { description: undefined } : {}),
            ...(changes.dueDate === null ? { dueDate: undefined } : {}),
            ...(changes.assigneeId === null ? { assigneeId: undefined } : {}),
            ...(changes.completedAt === null ? { completedAt: undefined } : {}),
          } as Card),
        );

        // Chỉ các trường này backend nhận; gửi thừa sẽ bị ValidationPipe loại bỏ.
        const patch: CardPatch = {};
        if (changes.title !== undefined) patch.title = changes.title;
        if (changes.description !== undefined) patch.description = changes.description;
        if (changes.priority !== undefined) patch.priority = changes.priority;
        if (changes.dueDate !== undefined) patch.dueDate = changes.dueDate;
        if (changes.assigneeId !== undefined) patch.assigneeId = changes.assigneeId;
        if (changes.completedAt !== undefined) patch.completedAt = changes.completedAt;
        if (Object.keys(patch).length === 0) return;

        try {
          await api.patch<ApiCard>(`/cards/${id}`, patch);
        } catch (e) {
          patchState(store, upsertEntity(before));
          store.fail(describeError(e, 'Failed to save card changes.'));
        }
      },

      // `listId` không cần nữa với state phẳng (trước dùng để biết xoá khỏi bucket
      // nào) — vẫn khai trong chữ ký để không phải sửa mọi nơi gọi.
      async deleteCard(id: string, listId?: string): Promise<void> {
        const before = store.entityMap()[id];
        patchState(store, removeEntity(id));
        try {
          await api.delete(`/cards/${id}`);
        } catch (e) {
          if (before) patchState(store, upsertEntity(before));
          store.fail(describeError(e, 'Failed to delete card.'));
        }
      },

      /** Kéo-thả card giữa/trong list — và tuỳ chọn đổi luôn mức ưu tiên khi kéo
       *  giữa các ô swimlane (đổi cả 2 trục cùng lúc): cập nhật vị trí ngay, lưu
       *  ngầm phía sau, hoàn tác + đánh dấu lỗi trên đúng thẻ nếu "lưu" thất bại. */
      // `fromListId` không cần nữa — cột nguồn đọc thẳng từ `before.listId` — vẫn
      // khai trong chữ ký để không phải sửa mọi nơi gọi.
      async moveCardOptimistic(
        cardId: string,
        fromListId: string | undefined,
        toListId: string,
        newIndex: number,
        newPriority?: CardPriority,
      ): Promise<void> {
        const before = store.entityMap()[cardId];
        if (!before) return;

        // `position` là số THỰC nên chỉ cần đổi ĐÚNG MỘT thẻ — thẻ được kéo — bằng
        // trung điểm hai thẻ hàng xóm ở vị trí đích. KHÔNG đánh số lại cả cột: các
        // thẻ khác giữ nguyên position, `cardsByList` ở `withComputed` tự sắp đúng
        // thứ tự hiển thị.
        const targetSiblings = store
          .entities()
          .filter((c) => c.listId === toListId && c.id !== cardId)
          .sort((a, b) => a.position - b.position);
        const clampedIndex = Math.max(0, Math.min(newIndex, targetSiblings.length));
        const position = midpoint(
          targetSiblings[clampedIndex - 1]?.position,
          targetSiblings[clampedIndex]?.position,
        );

        patchState(store, upsertEntity({ ...before, listId: toListId, position, priority: newPriority ?? before.priority }));
        patchState(store, { savingCardIds: withId(store.savingCardIds(), cardId) });

        try {
          await api.patch<ApiCard>(`/cards/${cardId}/move`, { toListId, position });

          // Mức ưu tiên đổi theo swimlane là một thay đổi RIÊNG — endpoint move không
          // nhận nó, phải gọi thêm PATCH /cards/:id.
          if (newPriority && newPriority !== before.priority) {
            await api.patch<ApiCard>(`/cards/${cardId}`, { priority: newPriority });
          }
          patchState(store, { savingCardIds: withoutId(store.savingCardIds(), cardId) });
        } catch (e) {
          patchState(store, upsertEntity(before)); // ✅ chỉ trả lại đúng thẻ này
          patchState(store, {
            savingCardIds: withoutId(store.savingCardIds(), cardId),
            errorCardIds: withId(store.errorCardIds(), cardId),
          });
          store.fail(describeError(e, `Failed to save position for card "${before.title}" — reverted.`));
          setTimeout(() => {
            patchState(store, { errorCardIds: withoutId(store.errorCardIds(), cardId) });
          }, 500);
        }
      },
    })),
  );
}
