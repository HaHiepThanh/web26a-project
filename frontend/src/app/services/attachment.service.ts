import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiAttachment, Attachment } from '../models';
import { ApiService } from './api.service';
import { describeError } from './api-error.util';

/** Backend chặn ở 10MB — kiểm luôn ở đây để khỏi tải lên rồi mới bị từ chối. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * [BONUS] Đính kèm tệp/hình trong thẻ — GỌI BACKEND THẬT (`/attachments`).
 *
 * Trước đây đọc tệp thành base64 rồi giữ trong signal: F5 là mất, và một tấm ảnh
 * 5MB ngốn ~6.7MB RAM ngay trong bộ nhớ trình duyệt. Nay tệp nằm trên Supabase
 * Storage, frontend chỉ giữ metadata + link tải.
 *
 * ⚠️ `url` là link CÓ CHỮ KÝ, hết hạn sau 1 giờ. Không được cache lâu — mỗi lần
 *    mở lại thẻ phải gọi `loadAttachments(force)` để lấy link mới.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private readonly api = inject(ApiService);

  readonly byCard = signal<Record<string, Attachment[]>>({});
  readonly uploading = signal(false);
  readonly lastError = signal<{ id: number; message: string } | null>(null);
  private errorSeq = 0;

  /** Thời điểm nạp gần nhất theo thẻ — dùng để biết link ký sắp hết hạn chưa. */
  private readonly loadedAt = new Map<string, number>();
  /** Nạp lại sau 45 phút, sớm hơn hạn 60 phút của link ký một quãng an toàn. */
  private readonly LAM_MOI_SAU = 45 * 60 * 1000;

  /** Số đính kèm theo card — dùng để hiện badge 📎 ở mặt thẻ ngoài danh sách. */
  readonly countByCard = computed(() => {
    const result: Record<string, number | undefined> = {};
    for (const [cardId, list] of Object.entries(this.byCard())) {
      if (list.length) result[cardId] = list.length;
    }
    return result;
  });

  /** URL ảnh bìa theo card — mặt thẻ ngoài danh sách dùng để vẽ ảnh bìa. */
  readonly coverUrlByCard = computed(() => {
    const result: Record<string, string | undefined> = {};
    for (const [cardId, list] of Object.entries(this.byCard())) {
      const cover = list.find((a) => a.isCover && a.isImage);
      if (cover?.url) result[cardId] = cover.url;
    }
    return result;
  });

  private fail(message: string): void {
    this.errorSeq++;
    this.lastError.set({ id: this.errorSeq, message });
  }

  private toAttachment(r: ApiAttachment): Attachment {
    return {
      id: r.id,
      cardId: r.cardId,
      name: r.name,
      mimeType: r.mimeType,
      url: r.url,
      size: r.sizeBytes,
      isImage: r.isImage,
      isCover: r.isCover,
      uploadedBy: r.uploadedBy,
      createdAt: r.createdAt,
    };
  }

  attachmentsFor(cardId: string): Attachment[] {
    return [...(this.byCard()[cardId] ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  coverFor(cardId: string): Attachment | null {
    return (this.byCard()[cardId] ?? []).find((a) => a.isCover && a.isImage) ?? null;
  }

  /** Nạp đính kèm của 1 thẻ. Tự nạp lại khi link ký sắp hết hạn. */
  async loadAttachments(cardId: string, force = false): Promise<void> {
    if (!cardId) return;
    const nạpLúc = this.loadedAt.get(cardId);
    if (!force && nạpLúc && Date.now() - nạpLúc < this.LAM_MOI_SAU) return;

    try {
      const rows = await this.api.get<ApiAttachment[]>(
        `/attachments?cardId=${encodeURIComponent(cardId)}`,
      );
      this.byCard.update((map) => ({ ...map, [cardId]: rows.map((r) => this.toAttachment(r)) }));
      this.loadedAt.set(cardId, Date.now());
    } catch (e) {
      this.fail(describeError(e, 'Không tải được danh sách đính kèm.'));
    }
  }

  /**
   * Tải lên lần lượt từng tệp.
   *
   * Cố tình KHÔNG chạy song song: chọn 10 tệp một lúc mà bắn 10 request cùng lúc
   * thì vừa nghẽn đường truyền vừa dễ chạm giới hạn của Storage. Chậm hơn một
   * chút nhưng chắc chắn hơn, và thanh tiến trình cũng dễ hiểu hơn.
   */
  async addFiles(cardId: string, files: File[]): Promise<Attachment[]> {
    const added: Attachment[] = [];
    this.uploading.set(true);
    try {
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          this.fail(`"${file.name}" nặng quá ${MAX_BYTES / 1024 / 1024}MB nên không tải lên được.`);
          continue;
        }
        const form = new FormData();
        form.append('cardId', cardId);
        form.append('file', file, file.name);
        try {
          const row = await this.api.upload<ApiAttachment>('/attachments', form);
          this.applyRemote(row);
          added.push(this.toAttachment(row));
        } catch (e) {
          this.fail(describeError(e, `Không tải lên được "${file.name}".`));
        }
      }
    } finally {
      this.uploading.set(false);
    }
    return added;
  }

  async remove(cardId: string, id: string): Promise<void> {
    const previous = this.byCard();
    this.byCard.update((map) => ({
      ...map,
      [cardId]: (map[cardId] ?? []).filter((a) => a.id !== id),
    }));
    try {
      await this.api.delete(`/attachments/${id}`);
    } catch (e) {
      this.byCard.set(previous);
      this.fail(describeError(e, 'Không xoá được tệp đính kèm.'));
    }
  }

  /** Đặt/bỏ 1 ảnh làm bìa — backend tự gỡ cờ bìa của các ảnh còn lại. */
  async toggleCover(cardId: string, id: string): Promise<void> {
    const list = this.byCard()[cardId] ?? [];
    const target = list.find((a) => a.id === id);
    if (!target || !target.isImage) return;
    const isCover = !target.isCover;

    const previous = this.byCard();
    this.byCard.update((map) => ({
      ...map,
      [cardId]: (map[cardId] ?? []).map((a) => ({
        ...a,
        isCover: a.id === id ? isCover : false,
      })),
    }));

    try {
      await this.api.patch<ApiAttachment>(`/attachments/${id}/cover`, { isCover });
    } catch (e) {
      this.byCard.set(previous);
      this.fail(describeError(e, 'Không đặt được ảnh bìa.'));
    }
  }

  // ---- Nhận từ WebSocket ----

  /** Upsert theo id, và tự gỡ cờ bìa của ảnh khác khi ảnh này vừa thành bìa. */
  applyRemote(r: ApiAttachment): void {
    const att = this.toAttachment(r);
    this.byCard.update((map) => {
      const current = map[att.cardId];
      if (!current) return map; // thẻ chưa mở — lần đầu mở sẽ nạp đủ
      const idx = current.findIndex((a) => a.id === att.id);
      const next = idx >= 0 ? current.map((a) => (a.id === att.id ? att : a)) : [...current, att];
      return {
        ...map,
        [att.cardId]: att.isCover ? next.map((a) => (a.id === att.id ? a : { ...a, isCover: false })) : next,
      };
    });
  }

  applyRemoteDeleted(cardId: string, id: string): void {
    this.byCard.update((map) => {
      const current = map[cardId];
      if (!current) return map;
      return { ...map, [cardId]: current.filter((a) => a.id !== id) };
    });
  }

  clearCard(cardId: string): void {
    this.loadedAt.delete(cardId);
    this.byCard.update((map) => {
      const next = { ...map };
      delete next[cardId];
      return next;
    });
  }
}
