import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/access/access.service';
import { ModerationService } from '../../common/moderation/moderation.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Bucket đã tạo sẵn ở Supabase Storage — RIÊNG TƯ, chỉ lấy được qua signed URL. */
const BUCKET = 'card-attachments';

/** Tệp tối đa 10MB — khớp `file_size_limit` đặt trên bucket. */
const MAX_BYTES = 10 * 1024 * 1024;

/** Link tải sống 1 giờ. Đủ để xem/tải, mà lỡ lộ ra ngoài thì cũng tự hết hạn. */
const SIGNED_URL_TTL = 3600;

interface AttachmentRow {
  id: string;
  card_id: string;
  name: string;
  mime_type: string;
  storage_path: string;
  size_bytes: number;
  is_image: boolean;
  is_cover: boolean;
  uploaded_by: string;
  created_at: string;
}

export interface AttachmentResponse {
  id: string;
  cardId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  isCover: boolean;
  uploadedBy: string;
  createdAt: string;
  /** Link tải có chữ ký, hết hạn sau 1 giờ. Không phải link cố định. */
  url: string | null;
}

/**
 * Tệp đính kèm trong thẻ.
 *
 * ── Vì sao đưa file lên Supabase Storage chứ không nhét base64 vào database?
 * Cột `card_attachments.storage_path` đã nói rõ ý định đó. Nhét base64 vào một
 * cột `text` thì mỗi tấm ảnh 2MB phình thành ~2.7MB trong bảng, và MỌI câu
 * `SELECT *` trên bảng đó đều kéo nguyên cục dữ liệu về — chỉ liệt kê tên tệp
 * cũng phải tải hết ảnh.
 *
 * ── Vì sao bucket riêng tư + signed URL chứ không để public?
 * Bucket public nghĩa là ai biết đường dẫn cũng tải được, mà đường dẫn thì nằm
 * ngay trong phản hồi API. Đính kèm là tài liệu nội bộ của công ty — phải đi qua
 * đúng những phép kiểm tra quyền như mọi endpoint khác, rồi backend mới cấp link
 * tạm thời.
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
    private readonly moderation: ModerationService,
  ) {}

  /** Đổi dòng thô + cấp link ký tạm. Ký hàng loạt trong 1 request, không ký từng cái. */
  private async toResponse(
    rows: AttachmentRow[],
  ): Promise<AttachmentResponse[]> {
    if (!rows.length) return [];

    const { data: signed } = await this.supabase.client.storage
      .from(BUCKET)
      .createSignedUrls(
        rows.map((r) => r.storage_path),
        SIGNED_URL_TTL,
      );

    const urlByPath = new Map<string, string>();
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }

    return rows.map((r) => ({
      id: r.id,
      cardId: r.card_id,
      name: r.name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      isImage: r.is_image,
      isCover: r.is_cover,
      uploadedBy: r.uploaded_by,
      createdAt: r.created_at,
      url: urlByPath.get(r.storage_path) ?? null,
    }));
  }

  async findAll(uid: string, cardId: string): Promise<AttachmentResponse[]> {
    if (!cardId) return [];
    await this.access.assertCardAccess(uid, cardId);

    const { data, error } = await this.supabase.client
      .from('card_attachments')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Đọc đính kèm thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to load attachments');
    }
    return this.toResponse(data as AttachmentRow[]);
  }

  /**
   * Toàn bộ đính kèm của MỌI thẻ trong 1 board, nạp 1 lần khi mở board.
   *
   * Trước đây đính kèm chỉ nạp khi mở modal của TỪNG thẻ (`findAll` ở trên) —
   * nên bìa/số đếm đính kèm trên mặt thẻ ngoài board chỉ hiện đúng với thẻ đã
   * từng được mở ít nhất 1 lần trong phiên hiện tại. Thẻ do người khác thêm
   * ảnh, hoặc thêm ở phiên trước, thì mặt thẻ trống trơn cho tới khi ai đó mở
   * nó ra. Endpoint này nạp trước toàn bộ để mặt thẻ đúng ngay từ lúc vào board.
   *
   * `cards` không có board_id nên phải đi vòng qua `lists`, giống `CardsService.findAll`.
   */
  async findAllByBoard(
    uid: string,
    boardId: string,
  ): Promise<AttachmentResponse[]> {
    if (!boardId) return [];
    await this.access.assertBoardAccess(uid, boardId);

    const sb = this.supabase.client;
    const { data: lists } = await sb
      .from('lists')
      .select('id')
      .eq('board_id', boardId);
    if (!lists?.length) return [];

    const { data: cards } = await sb
      .from('cards')
      .select('id')
      .in(
        'list_id',
        lists.map((l) => l.id),
      );
    if (!cards?.length) return [];

    const { data, error } = await this.supabase.client
      .from('card_attachments')
      .select('*')
      .in(
        'card_id',
        cards.map((c) => c.id),
      )
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Đọc đính kèm theo board thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to load attachments');
    }
    return this.toResponse(data as AttachmentRow[]);
  }

  async upload(
    uid: string,
    cardId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ): Promise<AttachmentResponse> {
    if (!file) throw new BadRequestException('No file selected.');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(
        `File must be at most ${MAX_BYTES / 1024 / 1024}MB.`,
      );
    }

    const card = await this.access.assertCardAccess(uid, cardId);

    // KIỂM DUYỆT ẢNH TRƯỚC KHI LƯU.
    //
    // Đường này quan trọng hơn vẻ ngoài của nó: ảnh ĐẦU TIÊN của thẻ tự động
    // thành BÌA THẺ (xem `isCover` bên dưới), tức nó hiện thẳng trên mặt board
    // cho cả nhóm thấy mà không ai phải bấm vào. Lọc avatar và ảnh nền mà bỏ
    // qua đây thì gần như chưa lọc gì.
    //
    // Tệp không phải ảnh (PDF, docx...) vẫn đi qua bình thường — đây là tính
    // năng đính kèm tài liệu làm việc.
    const { laAnh, mime: mimeThat } = await this.moderation.kiemTraNeuLaAnh(
      file.buffer,
      `attachment card=${cardId}`,
      file.originalname,
    );

    // Đường dẫn do SERVER đặt, không lấy tên tệp người dùng gửi lên.
    // ⚠️ Tên tệp từ client có thể chứa "../" hoặc ký tự lạ — ghép thẳng vào
    //    đường dẫn là mở đường ghi đè file của thẻ khác. Tên gốc vẫn được giữ,
    //    nhưng nằm ở cột `name` để hiển thị, không phải ở đường dẫn.
    const duoi = file.originalname.includes('.')
      ? '.' +
        file.originalname
          .split('.')
          .pop()!
          .replace(/[^A-Za-z0-9]/g, '')
          .slice(0, 8)
      : '';
    const storagePath = `${card.orgId}/${cardId}/${randomUUID()}${duoi}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, {
        // Ảnh thì dùng mime suy từ nội dung thật, không dùng chuỗi client khai.
        contentType: mimeThat ?? file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      this.logger.error(`Tải tệp lên Storage thất bại: ${uploadError.message}`);
      throw new InternalServerErrorException('Failed to upload file');
    }

    // Theo NỘI DUNG THẬT, không theo chuỗi client khai: bản cũ đọc
    // `file.mimetype` nên khai `image/png` cho một file zip là nó vẫn được đặt
    // làm bìa thẻ rồi hỏng khi hiển thị.
    const isImage = laAnh;
    // Ảnh ĐẦU TIÊN của thẻ tự động thành bìa — trước đây phải bấm riêng "Set as
    // cover" mới thấy, còn mặt thẻ ngoài board thì không có gì báo hiệu "thẻ
    // này có đính kèm" nên gần như không ai biết mà bấm. Chỉ tự set khi thẻ
    // CHƯA có bìa nào — ảnh thứ hai trở đi vẫn cần bấm tay, không tự ý thay bìa
    // người dùng đã chọn.
    let isCover = false;
    if (isImage) {
      const { data: existingCover } = await this.supabase.client
        .from('card_attachments')
        .select('id')
        .eq('card_id', cardId)
        .eq('is_cover', true)
        .maybeSingle();
      isCover = !existingCover;
    }

    const { data, error } = await this.supabase.client
      .from('card_attachments')
      .insert({
        card_id: cardId,
        name: file.originalname.slice(0, 200),
        mime_type: file.mimetype,
        storage_path: storagePath,
        size_bytes: file.size,
        is_image: isImage,
        is_cover: isCover,
        uploaded_by: uid,
      })
      .select()
      .single();

    if (error) {
      // Ghi bảng hỏng thì dọn file vừa lên, tránh để lại rác không ai tham chiếu.
      await this.supabase.client.storage.from(BUCKET).remove([storagePath]);
      this.logger.error(`Ghi card_attachments thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to save attachment');
    }

    const [created] = await this.toResponse([data as AttachmentRow]);
    this.realtime.emitToBoard(card.boardId, 'attachment.changed', uid, {
      cardId,
      attachment: created,
    });
    return created;
  }

  private async assertAttachment(
    uid: string,
    id: string,
  ): Promise<{ row: AttachmentRow; boardId: string }> {
    const { data, error } = await this.supabase.client
      .from('card_attachments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error?.code === '22P02' || !data)
      throw new NotFoundException('Attachment not found.');

    const card = await this.access.assertCardAccess(
      uid,
      (data as AttachmentRow).card_id,
    );
    return { row: data as AttachmentRow, boardId: card.boardId };
  }

  /** Đặt/bỏ ảnh bìa. Mỗi thẻ chỉ MỘT ảnh bìa nên phải gỡ cờ của các tệp còn lại. */
  async setCover(
    uid: string,
    id: string,
    isCover: boolean,
  ): Promise<AttachmentResponse> {
    const { row, boardId } = await this.assertAttachment(uid, id);
    if (isCover && !row.is_image) {
      throw new BadRequestException('Only images can be set as the cover.');
    }

    const sb = this.supabase.client;
    if (isCover) {
      await sb
        .from('card_attachments')
        .update({ is_cover: false })
        .eq('card_id', row.card_id);
    }

    const { data, error } = await sb
      .from('card_attachments')
      .update({ is_cover: isCover })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Đặt ảnh bìa thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to set cover image');
    }

    const [updated] = await this.toResponse([data as AttachmentRow]);
    this.realtime.emitToBoard(boardId, 'attachment.changed', uid, {
      cardId: row.card_id,
      attachment: updated,
    });
    return updated;
  }

  async remove(uid: string, id: string): Promise<void> {
    const { row, boardId } = await this.assertAttachment(uid, id);

    const { error } = await this.supabase.client
      .from('card_attachments')
      .delete()
      .eq('id', id);
    if (error) {
      this.logger.error(`Xoá đính kèm thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete attachment');
    }

    // Xoá file khỏi Storage SAU khi xoá dòng. Ngược lại thì file mất mà dòng còn
    // → giao diện hiện một đính kèm bấm vào không ra gì.
    const { error: storageError } = await this.supabase.client.storage
      .from(BUCKET)
      .remove([row.storage_path]);
    if (storageError) {
      // Không ném lỗi: với người dùng thì đính kèm đã biến mất, đúng ý họ.
      // Chỉ còn một file mồ côi trong Storage — ghi log để dọn sau.
      this.logger.warn(
        `Còn file mồ côi trong Storage: ${row.storage_path} — ${storageError.message}`,
      );
    }

    this.realtime.emitToBoard(boardId, 'attachment.deleted', uid, {
      cardId: row.card_id,
      id,
    });
  }
}
