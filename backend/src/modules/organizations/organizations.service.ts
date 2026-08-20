import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/**
 * Tổ chức (Organization) + thành viên + lời mời.
 *
 * Bảng liên quan (xem database.sql mục 3):
 *   organizations         — id, name, slug (UNIQUE), owner_id, created_at
 *   organization_members  — id, org_id, user_id, role('owner'|'admin'|'member')
 *   organization_invites  — id, org_id, to_user_id, from_user_id, status, responded_at
 *
 * ⚠️ Backend dùng service_role key nên RLS bị bỏ qua. MỌI câu query phải tự
 *    giới hạn theo tổ chức của user — xem docs/LUAT-CHUNG.md.
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * TODO: tạo tổ chức mới; người tạo trở thành owner.
   * Phải làm 2 việc: insert `organizations`, rồi insert `organization_members`
   * với role 'owner'. Slug trùng → ném ConflictException (409).
   */
  async create(ownerUid: string, name: string, slug: string): Promise<unknown> {
    return null;
  }

  /** TODO: danh sách tổ chức mà user này là thành viên (kèm role của họ). */
  async findMine(uid: string): Promise<unknown[]> {
    return [];
  }

  /** TODO: các lời mời đang ở trạng thái 'pending' gửi tới user này. */
  async findMyInvites(uid: string): Promise<unknown[]> {
    return [];
  }

  /**
   * TODO: trả lời lời mời. accept=true → status 'accepted' + thêm dòng
   * organization_members; accept=false → status 'declined'. Lời mời không phải
   * của mình → 403; không tồn tại → 404.
   */
  async respondInvite(uid: string, inviteId: string, accept: boolean): Promise<unknown> {
    return null;
  }

  /**
   * TODO: danh sách thành viên của tổ chức (join `users` để có tên/email).
   * `uid` dùng để kiểm tra người gọi CÓ thuộc tổ chức này không — không thuộc
   * thì 403, đừng trả dữ liệu ra ngoài.
   */
  async findMembers(uid: string, orgId: string): Promise<unknown[]> {
    return [];
  }

  /**
   * TODO: đổi vai trò của 1 thành viên (chỉ owner gọi được — RolesGuard lo).
   * ⚠️ Mỗi tổ chức chỉ được ĐÚNG 1 owner (unique index uniq_org_single_owner):
   *    phong owner cho người khác thì phải hạ owner cũ xuống admin.
   */
  async changeRole(orgId: string, userId: string, role: 'owner' | 'admin' | 'member'): Promise<unknown> {
    return null;
  }

  /** TODO: xoá 1 thành viên khỏi tổ chức. Không cho tự xoá owner. */
  async removeMember(orgId: string, userId: string): Promise<unknown> {
    return null;
  }

  /**
   * TODO: mời 1 user vào tổ chức (insert organization_invites, status 'pending').
   * Người đã là thành viên → 409. Đã có lời mời đang chờ → 409
   * (partial unique index uniq_pending_invite sẽ báo lỗi 23505).
   */
  async invite(orgId: string, fromUid: string, toUserId: string): Promise<unknown> {
    return null;
  }
}
