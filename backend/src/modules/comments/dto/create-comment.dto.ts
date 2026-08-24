import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCommentDto {
  // 'loose': id trong DB sinh bằng md5(...)::uuid, không phải version 4 chuẩn.
  @IsUUID('loose', { message: 'cardId must be a uuid.' })
  cardId: string;

  @IsString()
  @MinLength(1, { message: 'Comment content is required.' })
  content: string;
}
