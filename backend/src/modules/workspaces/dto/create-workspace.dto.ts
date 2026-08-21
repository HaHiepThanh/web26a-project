import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
}
