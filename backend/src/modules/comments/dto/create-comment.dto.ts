import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Trần 300 ký tự cho một bình luận.
 *
 * Bản trước chỉ chặn rỗng, không chặn trên — dán nguyên một trang văn bản vào ô
 * bình luận là ghi thẳng xuống `comments.content` (kiểu `text`, không giới hạn),
 * rồi mọi thẻ có bình luận đó phải kéo về cả khối. Con số 300 khớp với
 * `MAX_COMMENT_LENGTH` trong `comment-list.ts`; sửa một bên thì sửa cả hai.
 *
 * Giới hạn này chỉ áp cho bình luận MỚI. Bình luận cũ dài hơn vẫn đọc và xoá
 * được bình thường — không có endpoint sửa nên chúng không bao giờ phải đi qua
 * phép kiểm này.
 */
export class CreateCommentDto {
  // 'loose': id trong DB sinh bằng md5(...)::uuid, không phải version 4 chuẩn.
  @IsUUID('loose', { message: 'cardId must be a uuid.' })
  cardId: string;

  @IsString()
  @MinLength(1, { message: 'Comment content is required.' })
  @MaxLength(300, { message: 'Comment must be at most 300 characters.' })
  content: string;
}
