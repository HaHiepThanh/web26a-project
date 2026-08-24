import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateMessageDto {
  // 'loose': id trong DB sinh bằng md5(...)::uuid, không phải version 4 chuẩn.
  @IsUUID('loose', { message: 'boardId must be a uuid.' })
  boardId: string;

  @IsString()
  @MinLength(1, { message: 'Message content is required.' })
  content: string;
}
