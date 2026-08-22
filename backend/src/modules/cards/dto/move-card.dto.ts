import { IsNumber, IsUUID } from 'class-validator';

export class MoveCardDto {
  // 'loose': id trong DB sinh bằng md5(...)::uuid, không phải version 4 chuẩn.
  @IsUUID('loose', { message: 'toListId phải là uuid.' })
  toListId: string;

  @IsNumber({}, { message: 'position phải là số.' })
  position: number;
}
