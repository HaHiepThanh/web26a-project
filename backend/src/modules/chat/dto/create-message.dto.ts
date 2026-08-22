import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateMessageDto {
  // 'loose': id trong DB sinh bằng md5(...)::uuid, không phải version 4 chuẩn.
  @IsUUID('loose', { message: 'boardId phải là uuid.' })
  boardId: string;

  @IsString()
  @MinLength(1, { message: 'Nội dung tin nhắn không được để trống.' })
  content: string;
}
