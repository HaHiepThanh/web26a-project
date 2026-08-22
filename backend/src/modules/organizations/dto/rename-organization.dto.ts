import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body của PATCH /organizations/:id.
 *
 * CHỈ có `name`. `slug` cố tình không cho đổi: nó nằm trong mọi URL
 * (`/:orgSlug/workspace`, `/:orgSlug/board/:id`) và trong link mọi người đã lưu
 * hoặc gửi cho nhau — đổi một cái là gãy hết.
 */
export class RenameOrganizationDto {
  @IsString()
  @MinLength(1, { message: 'Tên tổ chức không được để trống.' })
  @MaxLength(100, { message: 'Tên tổ chức tối đa 100 ký tự.' })
  name: string;
}
