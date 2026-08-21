import { IsBoolean } from 'class-validator';

/**
 * Body của PATCH /organizations/invites/:inviteId.
 *
 * `accept` bắt buộc phải là boolean thật. Không dùng @IsOptional: thiếu trường
 * này thì không biết người dùng đồng ý hay từ chối — đoán bừa là sai nghiệp vụ.
 */
export class RespondInviteDto {
  @IsBoolean({ message: 'accept phải là true hoặc false.' })
  accept: boolean;
}
