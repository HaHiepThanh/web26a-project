import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Body của POST /workspaces.
 *
 * `orgId` phải là uuid: sai định dạng mà để lọt xuống Supabase thì Postgres báo
 * `invalid input syntax for type uuid` → 500, thay vì 400 nói rõ sai chỗ nào.
 */
export class CreateWorkspaceDto {
  @IsUUID('4', { message: 'orgId phải là uuid hợp lệ.' })
  orgId: string;

  @IsString()
  @MinLength(1, { message: 'Tên workspace không được để trống.' })
  @MaxLength(100, { message: 'Tên workspace tối đa 100 ký tự.' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;

  /**
   * 'org'        — mọi thành viên trong tổ chức thấy workspace này (mặc định)
   * 'restricted' — chỉ những người liệt kê trong `memberIds`
   */
  @IsOptional()
  @IsIn(['org', 'restricted'], { message: "visibility phải là 'org' hoặc 'restricted'." })
  visibility?: 'org' | 'restricted';

  /** Chỉ có tác dụng khi `visibility === 'restricted'`. Người tạo luôn được thêm sẵn. */
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
