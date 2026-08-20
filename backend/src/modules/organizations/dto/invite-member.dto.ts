import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body của POST /organizations/:id/invites.
 *
 * `toUserId` là Firebase uid (chuỗi 28 ký tự), KHÔNG phải uuid — cột
 * `organization_invites.to_user_id` khai kiểu text tham chiếu `users(id)`.
 * Vì vậy dùng @IsString chứ không phải @IsUUID.
 */
export class InviteMemberDto {
  @IsString()
  @IsNotEmpty({ message: 'toUserId không được để trống.' })
  @MaxLength(128, { message: 'toUserId không hợp lệ.' })
  toUserId: string;
}
