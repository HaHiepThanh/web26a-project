import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Body của POST /workspaces.
 *
 * `orgId` phải là uuid: sai định dạng mà để lọt xuống Supabase thì Postgres báo
 * `invalid input syntax for type uuid` → 500, thay vì 400 nói rõ sai chỗ nào.
 */
export class CreateWorkspaceDto {
  @IsUUID('4', { message: 'orgId must be a valid uuid.' })
  orgId: string;

  @IsString()
  @MinLength(1, { message: 'Workspace name is required.' })
  @MaxLength(100, { message: 'Workspace name must be at most 100 characters.' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must be at most 500 characters.' })
  description?: string;

  /**
   * 'org'        — mọi thành viên trong tổ chức thấy workspace này (mặc định)
   * 'restricted' — chỉ những người liệt kê trong `memberIds`
   */
  @IsOptional()
  @IsIn(['org', 'restricted'], { message: "visibility must be 'org' or 'restricted'." })
  visibility?: 'org' | 'restricted';

  /** Chỉ có tác dụng khi `visibility === 'restricted'`. Người tạo luôn được thêm sẵn. */
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
