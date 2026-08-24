import { inject, Signal } from '@angular/core';
import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { EntityState, EntityProps, upsertEntity, upsertEntities, removeEntity, removeEntities } from '@ngrx/signals/entities';
import { ApiAttachment, Attachment } from '../../models';
import { ApiService } from '../../services/api.service';
import { describeError } from '../../services/api-error.util';
import { toAttachment } from './attachment.mapper';
import { AttachmentExtraState } from './attachment.state';

/** Backend chặn ở 10MB — kiểm luôn ở đây để khỏi tải lên rồi mới bị từ chối. */
const MAX_BYTES = 10 * 1024 * 1024;
/** Nạp lại sau 45 phút, sớm hơn hạn 60 phút của link ký một quãng an toàn. */
const LAM_MOI_SAU = 45 * 60 * 1000;

interface AttachmentMethodsProps extends EntityProps<Attachment> {
  attachmentsByCard: Signal<Record<string, Attachment[]>>;
}

/**
 * Đính kèm tệp/hình trong thẻ — GỌI BACKEND THẬT (`/attachments`).
 *
 * ⚠️ `url` là link CÓ CHỮ KÝ, hết hạn sau 1 giờ — không được cache lâu, mỗi lần
 *    mở lại thẻ phải gọi `loadAttachments` để lấy link mới (xem `LAM_MOI_SAU`).
 */
export function withAttachmentMethods() {
  return signalStoreFeature(
    {
      state: type<EntityState<Attachment> & AttachmentExtraState>(),
      props: type<AttachmentMethodsProps>(),
      methods: type<{ fail(message: string): void }>(),
    },
    withMethods((store, api = inject(ApiService)) => ({
      attachmentsFor(cardId: string): Attachment[] {
        return store.attachmentsByCard()[cardId] ?? [];
      },

      coverFor(cardId: string): Attachment | null {
        return (store.attachmentsByCard()[cardId] ?? []).find((a) => a.isCover && a.isImage) ?? null;
      },

      /** Nạp đính kèm của 1 thẻ. Tự nạp lại khi link ký sắp hết hạn. */
      async loadAttachments(cardId: string, force = false): Promise<void> {
        if (!cardId) return;
        const napLuc = store.loadedAt()[cardId];
        if (!force && napLuc && Date.now() - napLuc < LAM_MOI_SAU) return;

        try {
          const rows = await api.get<ApiAttachment[]>(`/attachments?cardId=${encodeURIComponent(cardId)}`);
          const staleIds = store.entities().filter((a) => a.cardId === cardId).map((a) => a.id);
          patchState(
            store,
            removeEntities(staleIds),
            upsertEntities(rows.map(toAttachment)),
            { loadedAt: { ...store.loadedAt(), [cardId]: Date.now() } },
          );
        } catch (e) {
          store.fail(describeError(e, 'Failed to load attachments.'));
        }
      },

      /**
       * Nạp đính kèm của TOÀN BỘ thẻ trong 1 board, 1 lần khi mở board — để bìa/
       * số đếm đính kèm hiện đúng trên mặt thẻ ngay cả với thẻ chưa từng mở modal
       * (trước đây phải mở modal của từng thẻ thì `loadAttachments` mới chạy).
       */
      async loadAttachmentsForBoard(boardId: string): Promise<void> {
        if (!boardId) return;
        try {
          const rows = await api.get<ApiAttachment[]>(`/attachments?boardId=${encodeURIComponent(boardId)}`);
          const now = Date.now();
          const nextLoadedAt = { ...store.loadedAt() };
          for (const r of rows) nextLoadedAt[r.cardId] = now;
          patchState(store, upsertEntities(rows.map(toAttachment)), { loadedAt: nextLoadedAt });
        } catch (e) {
          store.fail(describeError(e, 'Failed to load attachments.'));
        }
      },

      /**
       * Tải lên lần lượt từng tệp.
       *
       * Cố tình KHÔNG chạy song song: chọn 10 tệp một lúc mà bắn 10 request cùng
       * lúc thì vừa nghẽn đường truyền vừa dễ chạm giới hạn của Storage.
       */
      async addFiles(cardId: string, files: File[]): Promise<Attachment[]> {
        const added: Attachment[] = [];
        patchState(store, { uploading: true });
        try {
          for (const file of files) {
            if (file.size > MAX_BYTES) {
              store.fail(`"${file.name}" is over ${MAX_BYTES / 1024 / 1024}MB and can't be uploaded.`);
              continue;
            }
            const form = new FormData();
            form.append('cardId', cardId);
            form.append('file', file, file.name);
            try {
              const row = await api.upload<ApiAttachment>('/attachments', form);
              const att = toAttachment(row);
              // Tệp vừa tải lên chưa bao giờ là bìa (phải bấm đặt bìa riêng sau khi
              // upload xong) nên chỉ cần upsert, không phải gỡ cờ bìa của ảnh khác.
              patchState(store, upsertEntity(att));
              added.push(att);
            } catch (e) {
              store.fail(describeError(e, `Failed to upload "${file.name}".`));
            }
          }
        } finally {
          patchState(store, { uploading: false });
        }
        return added;
      },

      async remove(cardId: string, id: string): Promise<void> {
        const before = store.entityMap()[id];
        patchState(store, removeEntity(id));
        try {
          await api.delete(`/attachments/${id}`);
        } catch (e) {
          if (before) patchState(store, upsertEntity(before));
          store.fail(describeError(e, 'Failed to delete attachment.'));
        }
      },

      /** Đặt/bỏ 1 ảnh làm bìa — backend tự gỡ cờ bìa của các ảnh còn lại. */
      async toggleCover(cardId: string, id: string): Promise<void> {
        const target = store.entityMap()[id];
        if (!target || !target.isImage) return;
        const isCover = !target.isCover;

        // Chỉ chụp lại ĐÚNG những entity thực sự đổi (thẻ đích + ảnh đang là bìa
        // cũ, nếu có) để hoàn tác đúng phạm vi khi API lỗi — không đụng ảnh khác.
        const oldCovers = store.entities().filter((a) => a.cardId === cardId && a.id !== id && a.isCover);
        const before = [target, ...oldCovers];

        patchState(
          store,
          upsertEntities([{ ...target, isCover }, ...oldCovers.map((a) => ({ ...a, isCover: false }))]),
        );

        try {
          await api.patch<ApiAttachment>(`/attachments/${id}/cover`, { isCover });
        } catch (e) {
          patchState(store, upsertEntities(before));
          store.fail(describeError(e, 'Failed to set cover image.'));
        }
      },
    })),
  );
}
