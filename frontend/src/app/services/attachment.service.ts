import { Injectable, computed, signal } from '@angular/core';
import { Attachment } from '../models';

let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** [BONUS] Đính kèm tệp/hình trong card. Demo lưu base64 tại chỗ (chưa có Storage thật) —
 *  cùng phong cách CommentService: mutate signal ngay, không có round-trip mạng. */
@Injectable({ providedIn: 'root' })
export class AttachmentService {
  readonly byCard = signal<Record<string, Attachment[]>>({});

  /** Số đính kèm theo card — dùng để hiện badge 📎 ở mặt thẻ ngoài danh sách (bonus). */
  readonly countByCard = computed(() => {
    const result: Record<string, number | undefined> = {};
    for (const [cardId, list] of Object.entries(this.byCard())) {
      if (list.length) result[cardId] = list.length;
    }
    return result;
  });

  attachmentsFor(cardId: string): Attachment[] {
    return [...(this.byCard()[cardId] ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  coverFor(cardId: string): Attachment | null {
    return (this.byCard()[cardId] ?? []).find((a) => a.isCover && a.isImage) ?? null;
  }

  /** Đọc từng File thành base64, thêm vào card. Ảnh đầu tiên tự làm bìa nếu chưa có bìa. */
  async addFiles(cardId: string, files: File[]): Promise<Attachment[]> {
    const added: Attachment[] = [];
    for (const file of files) {
      const dataUrl = await readAsDataUrl(file);
      const isImage = file.type.startsWith('image/');
      const hasCover = (this.byCard()[cardId] ?? []).some((a) => a.isCover);
      const att: Attachment = {
        id: mockId('att'),
        cardId,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataUrl,
        size: file.size,
        isImage,
        isCover: isImage && !hasCover,
        createdAt: new Date().toISOString(),
      };
      this.byCard.update((map) => ({ ...map, [cardId]: [...(map[cardId] ?? []), att] }));
      added.push(att);
    }
    return added;
  }

  remove(cardId: string, id: string): void {
    this.byCard.update((map) => ({ ...map, [cardId]: (map[cardId] ?? []).filter((a) => a.id !== id) }));
  }

  /** Đặt/bỏ 1 ảnh làm bìa — chỉ 1 ảnh được làm bìa cùng lúc. */
  toggleCover(cardId: string, id: string): void {
    this.byCard.update((map) => {
      const list = (map[cardId] ?? []).map((a) => {
        if (a.id === id) return { ...a, isCover: a.isImage ? !a.isCover : false };
        return { ...a, isCover: false }; // bỏ bìa của các ảnh khác
      });
      return { ...map, [cardId]: list };
    });
  }

  clearCard(cardId: string): void {
    this.byCard.update((map) => {
      const next = { ...map };
      delete next[cardId];
      return next;
    });
  }
}
