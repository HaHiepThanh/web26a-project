import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Body của POST /organizations/:id/invites.
 *
 * `toUserId` là Firebase uid (chuỗi 28 ký tự), KHÔNG phải uuid — cột
 * `organization_invites.to_user_id` khai kiểu text tham chiếu `users(id)`.
 * Vì vậy dùng @IsString chứ không phải @IsUUID.
 */
export class InviteMemberDto {
  @IsString()
  @IsNotEmpty({ message: 'toUserId is required.' })
  @MaxLength(128, { message: 'Invalid toUserId.' })
  toUserId: string;

  /**
   * Quyền người được mời sẽ nhận KHI HỌ ĐỒNG Ý. Mặc định 'member'.
   *
   * Không nhận 'owner': mỗi tổ chức chỉ có đúng 1 owner (partial unique index
   * `uniq_org_single_owner`), muốn chuyển thì dùng
   * PATCH /organizations/:id/members/:userId/role.
   */
  @IsOptional()
  @IsIn(['admin', 'member'], { message: "role must be 'admin' or 'member'." })
  role?: 'admin' | 'member';
}
