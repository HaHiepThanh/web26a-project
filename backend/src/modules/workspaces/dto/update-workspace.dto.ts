import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Body của PATCH /workspaces/:id.
 *
 * Cả hai trường đều optional — PATCH nghĩa là "sửa phần được gửi lên", trường
 * nào không gửi thì giữ nguyên. Đừng bắt buộc `name` ở đây, nếu không thì muốn
 * đổi mỗi mô tả cũng phải gửi kèm tên cũ.
 */
export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Workspace name is required.' })
  @MaxLength(100, { message: 'Workspace name must be at most 100 characters.' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must be at most 500 characters.' })
  description?: string;

  @IsOptional()
  @IsIn(['org', 'restricted'], { message: "visibility must be 'org' or 'restricted'." })
  visibility?: 'org' | 'restricted';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200, { message: 'Maximum 200 members per workspace.' })
  // @IsString chứ KHÔNG phải @IsUUID: `users.id` là Firebase uid (chuỗi 28 ký
  // tự như 'LtVYmqyWfFRxY2Hwj8Caw7TAgSz2'), không phải uuid. Dùng @IsUUID ở đây
  // là mọi lần chọn thành viên đều bị trả 400.
  @IsString({ each: true, message: 'memberIds must be a list of user ids.' })
  @MaxLength(128, { each: true, message: 'Invalid user id.' })
  memberIds?: string[];
}
