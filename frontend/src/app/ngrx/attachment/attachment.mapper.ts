import { ApiAttachment, Attachment } from '../../models';

export function toAttachment(r: ApiAttachment): Attachment {
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
