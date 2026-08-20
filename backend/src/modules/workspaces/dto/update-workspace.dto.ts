import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}
