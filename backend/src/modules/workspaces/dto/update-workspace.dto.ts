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
  @MinLength(1, { message: 'Tên workspace không được để trống.' })
  @MaxLength(100, { message: 'Tên workspace tối đa 100 ký tự.' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;

  @IsOptional()
  @IsIn(['org', 'restricted'], { message: "visibility phải là 'org' hoặc 'restricted'." })
  visibility?: 'org' | 'restricted';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200, { message: 'Tối đa 200 thành viên cho mỗi workspace.' })
  // @IsString chứ KHÔNG phải @IsUUID: `users.id` là Firebase uid (chuỗi 28 ký
  // tự như 'LtVYmqyWfFRxY2Hwj8Caw7TAgSz2'), không phải uuid. Dùng @IsUUID ở đây
  // là mọi lần chọn thành viên đều bị trả 400.
  @IsString({ each: true, message: 'memberIds phải là danh sách id người dùng.' })
  @MaxLength(128, { each: true, message: 'id người dùng không hợp lệ.' })
  memberIds?: string[];
}
