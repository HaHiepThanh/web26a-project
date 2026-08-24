import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Số ngày sống của link. Tối đa 30 — xem chú thích trong service. */
export class CreateInviteLinkDto {
  /**
   * Hạn tính bằng NGÀY kể từ lúc tạo, không phải một mốc thời gian tuyệt đối.
   *
   * Cố ý nhận số ngày thay vì `expiresAt`: nhận mốc tuyệt đối thì phải xử lý
   * múi giờ của client, đồng hồ client chạy sai, và mốc nằm trong quá khứ.
   * Nhận số ngày thì mốc do SERVER tính, không có chỗ nào sai lệch.
   */
  @IsOptional()
  @IsInt({ message: 'expiresInDays must be an integer.' })
  @Min(1, { message: 'expiresInDays must be at least 1.' })
  @Max(30, { message: 'expiresInDays cannot exceed 30.' })
  expiresInDays?: number;

  /** Quyền người dùng link sẽ nhận. Không cho 'owner' — mỗi tổ chức đúng 1 owner. */
  @IsOptional()
  @IsIn(['admin', 'member'], { message: "role must be 'admin' or 'member'." })
  role?: 'admin' | 'member';

  /** Giới hạn số lượt dùng. Bỏ trống = không giới hạn (vẫn bị chặn bởi hạn dùng). */
  @IsOptional()
  @IsInt({ message: 'maxUses must be an integer.' })
  @Min(1, { message: 'maxUses must be at least 1.' })
  @Max(500, { message: 'maxUses cannot exceed 500.' })
  maxUses?: number;
}
