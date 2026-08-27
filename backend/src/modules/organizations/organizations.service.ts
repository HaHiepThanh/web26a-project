import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RESERVED_SLUGS } from './constants/reserved-slugs';

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
/** Lời mời đang chờ tôi trả lời — kèm tên tổ chức và tên người mời để hiển thị. */
export interface MyInvite {
  id: string;
  orgId: string;
  orgName: string;
  /** Quyền sẽ nhận khi bấm Đồng ý — chuông thông báo hiện luôn cho người ta biết. */
  role: InviteRole;
  fromUser: { displayName: string | null; email: string };
  createdAt: string;
}

/**
 * Quyền chọn sẵn lúc mời. KHÔNG có 'owner': mỗi tổ chức chỉ đúng 1 owner, muốn
 * chuyển thì dùng PATCH /organizations/:id/members/:userId/role.
 */
export type InviteRole = 'admin' | 'member';
const INVITE_ROLES: InviteRole[] = ['admin', 'member'];

/** Lời mời tổ chức ĐÃ GỬI mà chưa ai trả lời (khác `MyInvite` — lời mời gửi TỚI tôi). */
export interface PendingInvite {
  id: string;
  orgId: string;
  toUserId: string;
  fromUserId: string;
  role: InviteRole;
  createdAt: string;
  toUser: {
    displayName: string | null;
    email: string;
    avatarUrl: string | null;
  };
}

/** Lời mời tham gia tổ chức. */
export interface InviteResponse {
  id: string;
  orgId: string;
  toUserId: string;
  fromUserId: string;
  role: InviteRole;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

/** Một thành viên của tổ chức, kèm thông tin hiển thị lấy từ bảng `users`. */
export interface OrgMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  user: {
    displayName: string | null;
    email: string;
    avatarUrl: string | null;
  };
}

/** Tổ chức mà user đang là thành viên, kèm vai trò của họ trong tổ chức đó. */
export interface MyOrganization {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Tạo tổ chức mới; người tạo trở thành owner.
   *
   * Hai lần INSERT phải đi cùng nhau: `organizations` rồi `organization_members`
   * với role 'owner'. Thiếu lần thứ hai là tổ chức tồn tại nhưng KHÔNG AI thuộc
   * về nó — kể cả người vừa tạo — và GET /organizations sẽ trả mảng rỗng.
   */
  async create(ownerUid: string, name: string, slug: string) {
    // Định dạng slug đã được DTO chặn. Còn lại là luật nghiệp vụ: slug nằm ở gốc
    // URL nên không được trùng route hệ thống.
    if (RESERVED_SLUGS.has(slug)) {
      throw new BadRequestException(
        `"${slug}" is a reserved system URL, please choose another name.`,
      );
    }

    // Không "kiểm tra tồn tại rồi mới insert": giữa 2 bước đó người khác vẫn
    // chen vào được. Cứ insert rồi bắt lỗi trùng UNIQUE (23505) — mẫu y hệt
    // auth.service.ts → assignGeneratedUsername().
    const { data: org, error } = await this.supabase.client
      .from('organizations')
      .insert({ name: name.trim(), slug, owner_id: ownerUid })
      .select() // ⚠️ thiếu dòng này là data = null
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(`URL "${slug}" is already taken.`);
      }
      this.logger.error(
        `Tạo tổ chức thất bại (uid=${ownerUid}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to create organization');
    }

    // Bước 2 — người tạo thành owner.
    const { error: memberError } = await this.supabase.client
      .from('organization_members')
      .insert({ org_id: org.id, user_id: ownerUid, role: 'owner' });

    if (memberError) {
      // Dọn lại tổ chức vừa tạo, nếu không sẽ để lại một tổ chức mồ côi giữ mất
      // slug vĩnh viễn mà không ai vào được.
      await this.supabase.client
        .from('organizations')
        .delete()
        .eq('id', org.id);
      this.logger.error(
        `Thêm owner thất bại, đã xoá tổ chức ${org.id}: ${memberError.message}`,
      );
      throw new InternalServerErrorException('Failed to create organization');
    }

    // API của dự án trả camelCase, còn Supabase trả tên cột snake_case.
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      ownerId: org.owner_id,
      createdAt: org.created_at,
    };
  }

  /**
   * Người gọi có thuộc tổ chức này không? Không thuộc thì ném 403 ngay.
   *
   * Backend dùng service_role key nên RLS bị bỏ qua — database KHÔNG tự chặn gì.
   * Mọi ràng buộc "chỉ đọc dữ liệu tổ chức của mình" đều do hàm này làm.
   */
  private async assertMember(
    uid: string,
    orgId: string,
  ): Promise<MyOrganization['role']> {
    const { data, error } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', uid)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Kiểm tra thành viên thất bại (uid=${uid}, org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to check access permissions',
      );
    }
    if (!data) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }
    return data.role as MyOrganization['role'];
  }

  /**
   * Danh sách tổ chức mà user này là thành viên, kèm role của họ.
   *
   * Đi từ `organization_members` chứ không phải từ `organizations`: chỉ những
   * dòng có `user_id = uid` mới được đọc, nên tổ chức của người khác không thể
   * lọt ra ngoài.
   */
  async findMine(uid: string): Promise<MyOrganization[]> {
    const { data, error } = await this.supabase.client
      .from('organization_members')
      .select('role, organizations(id, name, slug)')
      .eq('user_id', uid);

    if (error) {
      this.logger.error(
        `Đọc danh sách tổ chức thất bại (uid=${uid}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load organizations');
    }

    // Supabase trả dạng lồng { role, organizations: {...} } — map phẳng lại cho
    // frontend. Mẫu y hệt auth.service.ts → getMe().
    type Row = {
      role: MyOrganization['role'];
      organizations: { id: string; name: string; slug: string } | null;
    };

    return (data as unknown as Row[])
      .filter((r) => r.organizations)
      .map((r) => ({
        id: r.organizations!.id,
        name: r.organizations!.name,
        slug: r.organizations!.slug,
        role: r.role,
      }));
  }

  /**
   * Lời mời đang chờ user này trả lời.
   *
   * Không cần assertMember: câu query lọc thẳng theo `to_user_id = uid` nên
   * không thể lộ lời mời của người khác.
   */
  async findMyInvites(uid: string): Promise<MyInvite[]> {
    const { data, error } = await this.supabase.client
      .from('organization_invites')
      .select(
        'id, org_id, role, created_at, organizations(name), users!organization_invites_from_user_id_fkey(display_name, email)',
      )
      .eq('to_user_id', uid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Đọc lời mời thất bại (uid=${uid}): ${error.message}`);
      throw new InternalServerErrorException('Failed to load invites');
    }

    type Row = {
      id: string;
      org_id: string;
      role: InviteRole;
      created_at: string;
      organizations: { name: string } | null;
      users: { display_name: string | null; email: string } | null;
    };

    // Join lấy tên tổ chức + tên người mời: chuông thông báo cần hiện
    // "Nam mời bạn vào Công ty ABC", không phải hai chuỗi uuid.
    return (data as unknown as Row[]).map((r) => ({
      id: r.id,
      orgId: r.org_id,
      orgName: r.organizations?.name ?? '',
      role: r.role ?? 'member',
      fromUser: {
        displayName: r.users?.display_name ?? null,
        email: r.users?.email ?? '',
      },
      createdAt: r.created_at,
    }));
  }

  /**
   * Đồng ý hoặc từ chối lời mời.
   *
   * Route này KHÔNG gắn @Roles — người được mời chưa thuộc tổ chức nên chưa có
   * role nào cả. Việc kiểm tra nằm ở chỗ so `to_user_id` với uid trong token.
   */
  async respondInvite(
    uid: string,
    inviteId: string,
    accept: boolean,
  ): Promise<{ id: string; status: 'accepted' | 'declined' }> {
    const { data, error } = await this.supabase.client
      .from('organization_invites')
      .select('id, org_id, to_user_id, role, status')
      .eq('id', inviteId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Đọc lời mời thất bại (id=${inviteId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load invite');
    }
    if (!data) {
      throw new NotFoundException('Invite not found.');
    }

    // Lời mời gửi cho người khác — thiếu bước này là ai cũng bấm đồng ý hộ.
    if (data.to_user_id !== uid) {
      throw new ForbiddenException('This invite is not addressed to you.');
    }
    if (data.status !== 'pending') {
      throw new ConflictException('This invite has already been responded to.');
    }

    const status = accept ? 'accepted' : 'declined';

    const { error: updateError } = await this.supabase.client
      .from('organization_invites')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', inviteId);

    if (updateError) {
      this.logger.error(
        `Cập nhật lời mời thất bại (id=${inviteId}): ${updateError.message}`,
      );
      throw new InternalServerErrorException('Failed to update invite');
    }

    if (accept) {
      // ⚠️ PHẢI làm cả việc này. Chỉ đổi status mà quên thêm thành viên là người
      //    ta bấm đồng ý xong vẫn không vào được tổ chức — mà API vẫn trả 200
      //    nên rất khó phát hiện.
      const { error: memberError } = await this.supabase.client
        .from('organization_members')
        .insert({
          org_id: data.org_id,
          user_id: uid,
          role: (data.role as InviteRole) ?? 'member',
        });

      // 23505 = đã là thành viên rồi (vd hai tab cùng bấm đồng ý) — coi như xong,
      // không phải lỗi.
      if (memberError && memberError.code !== '23505') {
        // Trả status về pending để người dùng bấm lại được, tránh kẹt vĩnh viễn
        // ở trạng thái "đã đồng ý" mà không thuộc tổ chức.
        await this.supabase.client
          .from('organization_invites')
          .update({ status: 'pending', responded_at: null })
          .eq('id', inviteId);

        this.logger.error(
          `Thêm thành viên thất bại (invite=${inviteId}): ${memberError.message}`,
        );
        throw new InternalServerErrorException(
          'Failed to add you to the organization',
        );
      }
    }

    // Báo lại cho người đã gửi lời mời: danh sách thành viên của họ đang mở sẽ
    // tự cập nhật, không phải bấm F5 mới biết người ta đã đồng ý.
    const { data: inviter } = await this.supabase.client
      .from('organization_invites')
      .select('from_user_id')
      .eq('id', inviteId)
      .maybeSingle();
    if (inviter?.from_user_id) {
      this.realtime.emitToUser(
        inviter.from_user_id as string,
        'invite.responded',
        uid,
        {
          id: inviteId,
          orgId: data.org_id as string,
          status,
        },
      );
    }

    return { id: inviteId, status };
  }

  /**
   * Danh sách thành viên của tổ chức, kèm tên/email lấy từ bảng `users`.
   *
   * ⚠️ Kiểm tra người gọi có thuộc tổ chức không TRƯỚC khi đọc. Thiếu bước này
   * thì ai cũng lấy được danh sách nhân viên của mọi công ty — chỉ cần đoán uuid.
   */
  async findMembers(uid: string, orgId: string): Promise<OrgMember[]> {
    await this.assertMember(uid, orgId);

    const { data, error } = await this.supabase.client
      .from('organization_members')
      .select(
        'user_id, role, joined_at, users(display_name, email, avatar_url)',
      )
      .eq('org_id', orgId)
      .order('joined_at');

    if (error) {
      this.logger.error(
        `Đọc thành viên thất bại (org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load member list');
    }

    type Row = {
      user_id: string;
      role: OrgMember['role'];
      joined_at: string;
      users: {
        display_name: string | null;
        email: string;
        avatar_url: string | null;
      } | null;
    };

    // Trả kèm tên/email chứ không phải mỗi user_id trơ trọi — frontend cần hiển
    // thị "Nguyễn Văn A", không phải một chuỗi uuid.
    return (data as unknown as Row[]).map((r) => ({
      userId: r.user_id,
      role: r.role,
      joinedAt: r.joined_at,
      user: {
        displayName: r.users?.display_name ?? null,
        email: r.users?.email ?? '',
        avatarUrl: r.users?.avatar_url ?? null,
      },
    }));
  }

  /**
   * Đổi vai trò của 1 thành viên. Chỉ owner gọi được — RolesGuard lo phần đó.
   *
   * ⚠️ Mỗi tổ chức chỉ được ĐÚNG 1 owner (unique index `uniq_org_single_owner`),
   *    nên phong owner cho người khác thì phải HẠ OWNER CŨ XUỐNG ADMIN TRƯỚC.
   *    Làm ngược thứ tự là câu UPDATE vỡ ngay vì trùng index.
   */
  async changeRole(
    orgId: string,
    userId: string,
    role: 'owner' | 'admin' | 'member',
  ): Promise<{ userId: string; role: string }> {
    // 1. Người này có trong tổ chức không?
    const { data: target, error } = await this.supabase.client
      .from('organization_members')
      .select('user_id, role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Đọc thành viên thất bại (org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load member');
    }
    if (!target) {
      throw new NotFoundException(
        'This member was not found in the organization.',
      );
    }
    if (target.role === role) {
      return { userId, role }; // không đổi gì thì khỏi gọi database
    }

    // 2. Phong owner: hạ owner hiện tại xuống admin TRƯỚC.
    let demotedOwnerId: string | null = null;
    if (role === 'owner') {
      const { data: currentOwner } = await this.supabase.client
        .from('organization_members')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('role', 'owner')
        .maybeSingle();

      if (currentOwner && currentOwner.user_id !== userId) {
        const { error: demoteError } = await this.supabase.client
          .from('organization_members')
          .update({ role: 'admin' })
          .eq('org_id', orgId)
          .eq('user_id', currentOwner.user_id);

        if (demoteError) {
          this.logger.error(
            `Hạ owner cũ thất bại (org=${orgId}): ${demoteError.message}`,
          );
          throw new InternalServerErrorException(
            'Failed to transfer owner role',
          );
        }
        demotedOwnerId = currentOwner.user_id as string;
      }
    }

    // 3. Đổi role cho người được chỉ định.
    const { error: updateError } = await this.supabase.client
      .from('organization_members')
      .update({ role })
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (updateError) {
      // Supabase JS không có API transaction, nên tự phục hồi bước 2 để tổ chức
      // không rơi vào cảnh KHÔNG CÒN OWNER NÀO.
      if (demotedOwnerId) {
        await this.supabase.client
          .from('organization_members')
          .update({ role: 'owner' })
          .eq('org_id', orgId)
          .eq('user_id', demotedOwnerId);
      }
      this.logger.error(
        `Đổi vai trò thất bại (org=${orgId}, user=${userId}): ${updateError.message}`,
      );
      throw new InternalServerErrorException('Failed to change role');
    }

    return { userId, role };
  }

  /**
   * Xoá 1 thành viên khỏi tổ chức. Owner hoặc admin gọi được — RolesGuard lo.
   *
   * KHÔNG cho xoá owner: tổ chức sẽ mất chủ vĩnh viễn, mà route đổi vai trò
   * (#12) lại chỉ owner mới gọi được — không còn ai cứu được nữa. Muốn xoá owner
   * thì phải chuyển quyền cho người khác trước.
   */
  async removeMember(
    orgId: string,
    userId: string,
  ): Promise<{ userId: string; removed: true }> {
    const { data: target, error } = await this.supabase.client
      .from('organization_members')
      .select('user_id, role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Đọc thành viên thất bại (org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load member');
    }
    if (!target) {
      throw new NotFoundException(
        'This member was not found in the organization.',
      );
    }
    if (target.role === 'owner') {
      throw new BadRequestException(
        'Cannot remove the owner. Transfer ownership to someone else first.',
      );
    }

    const { error: deleteError } = await this.supabase.client
      .from('organization_members')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (deleteError) {
      this.logger.error(
        `Xoá thành viên thất bại (org=${orgId}, user=${userId}): ${deleteError.message}`,
      );
      throw new InternalServerErrorException('Failed to remove member');
    }

    // Người bị gỡ cần biết ngay — nếu không họ vẫn thao tác trên tổ chức đó rồi
    // ăn 403/404 ở mọi nút bấm mà không hiểu vì sao.
    this.realtime.emitToUser(userId, 'member.removed', userId, { orgId });

    return { userId, removed: true };
  }

  /**
   * Đổi tên tổ chức. KHÔNG cho đổi `slug`.
   *
   * Slug nằm trong mọi URL (`/:orgSlug/board/:id`) và trong link mọi người đã
   * lưu/gửi cho nhau — đổi là gãy hết. Tên hiển thị thì đổi thoải mái.
   */
  async rename(
    uid: string,
    orgId: string,
    name: string,
  ): Promise<MyOrganization> {
    const ten = name?.trim();
    if (!ten) throw new BadRequestException('Organization name is required.');

    const role = await this.assertMember(uid, orgId);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException(
        'Only the organization owner or an admin can rename it.',
      );
    }

    const { data, error } = await this.supabase.client
      .from('organizations')
      .update({ name: ten })
      .eq('id', orgId)
      .select('id, name, slug')
      .single();

    if (error) {
      this.logger.error(
        `Đổi tên tổ chức thất bại (org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to rename organization');
    }
    return {
      id: data.id as string,
      name: data.name as string,
      slug: data.slug as string,
      role,
    };
  }

  /**
   * Xoá hẳn tổ chức.
   *
   * ⚠️ CHỈ OWNER. Khác `rename` (owner hoặc admin đều được): đổi tên thì sửa lại
   *    được, còn xoá thì kéo theo TOÀN BỘ dữ liệu của tổ chức và không có đường
   *    lùi. Quyền đó chỉ thuộc về đúng một người.
   *
   * ⚠️ ON DELETE CASCADE khai trong database.sql khiến một dòng lệnh ở đây quét
   *    sạch 9 bảng: organization_members, organization_invites, workspaces →
   *    boards → lists → cards → labels, activity_logs, messages. Không có bản
   *    sao lưu nào ở tầng ứng dụng.
   *
   * `RolesGuard` ở controller đã chặn sẵn theo @Roles('owner'), nhưng vẫn kiểm
   * tra lại tại đây: guard đọc `req.params.id`, đổi tên tham số route một cái là
   * nó âm thầm hết tác dụng. Hai lớp cho một thao tác không thể hoàn tác.
   */
  async remove(
    uid: string,
    orgId: string,
  ): Promise<{ id: string; deleted: true }> {
    const { data: org, error: readError } = await this.supabase.client
      .from('organizations')
      .select('id, owner_id')
      .eq('id', orgId)
      .maybeSingle();

    if (readError) {
      // id sai định dạng uuid → coi như không tồn tại, đừng để lọt thành 500.
      if (readError.code === '22P02')
        throw new NotFoundException('Organization not found.');
      this.logger.error(
        `Đọc tổ chức thất bại (org=${orgId}): ${readError.message}`,
      );
      throw new InternalServerErrorException('Failed to load organization');
    }
    if (!org) throw new NotFoundException('Organization not found.');

    const role = await this.assertMember(uid, orgId);
    if (role !== 'owner') {
      throw new ForbiddenException(
        'Only the organization owner can delete it.',
      );
    }

    const { error } = await this.supabase.client
      .from('organizations')
      .delete()
      .eq('id', orgId);

    if (error) {
      this.logger.error(`Xoá tổ chức thất bại (org=${orgId}): ${error.message}`);
      throw new InternalServerErrorException('Failed to delete organization');
    }

    return { id: orgId, deleted: true };
  }

  /**
   * Lời mời tổ chức này ĐÃ GỬI mà chưa ai trả lời.
   *
   * Khác `findMyInvites` (lời mời gửi TỚI tôi): đây là danh sách người mình đang
   * chờ, hiện trong modal "Quản lý tổ chức". Chỉ owner/admin xem được — thành
   * viên thường không cần biết công ty đang mời những ai.
   */
  async findPendingInvites(
    uid: string,
    orgId: string,
  ): Promise<PendingInvite[]> {
    const role = await this.assertMember(uid, orgId);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException(
        'Only the organization owner or an admin can view sent invites.',
      );
    }

    const { data, error } = await this.supabase.client
      .from('organization_invites')
      .select(
        'id, to_user_id, from_user_id, role, created_at, users!organization_invites_to_user_id_fkey(display_name, email, avatar_url)',
      )
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(
        `Đọc lời mời đã gửi thất bại (org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load invites');
    }

    type Row = {
      id: string;
      to_user_id: string;
      from_user_id: string;
      role: InviteRole;
      created_at: string;
      users: {
        display_name: string | null;
        email: string;
        avatar_url: string | null;
      } | null;
    };

    return (data as unknown as Row[]).map((r) => ({
      id: r.id,
      orgId,
      toUserId: r.to_user_id,
      fromUserId: r.from_user_id,
      role: r.role ?? 'member',
      createdAt: r.created_at,
      // Kèm tên/email người được mời — nếu không thì giao diện chỉ hiện được một
      // chuỗi uid, chẳng ai biết đang chờ ai.
      toUser: {
        displayName: r.users?.display_name ?? null,
        email: r.users?.email ?? '',
        avatarUrl: r.users?.avatar_url ?? null,
      },
    }));
  }

  /** Huỷ một lời mời đã gửi (chỉ khi còn `pending`). */
  async cancelInvite(
    uid: string,
    inviteId: string,
  ): Promise<{ id: string; cancelled: true }> {
    const { data: invite, error } = await this.supabase.client
      .from('organization_invites')
      .select('id, org_id, status')
      .eq('id', inviteId)
      .maybeSingle();
    if (error?.code === '22P02' || !invite)
      throw new NotFoundException('Invite not found.');

    const role = await this.assertMember(uid, invite.org_id as string);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException(
        'Only the organization owner or an admin can cancel invites.',
      );
    }
    // Đã đồng ý/từ chối rồi thì không "huỷ" được nữa — người ta đã ở trong tổ
    // chức, muốn gỡ thì dùng DELETE /organizations/:id/members/:userId.
    if (invite.status !== 'pending') {
      throw new ConflictException(
        'This invite has already been responded to and cannot be cancelled.',
      );
    }

    const { error: deleteError } = await this.supabase.client
      .from('organization_invites')
      .delete()
      .eq('id', inviteId);
    if (deleteError) {
      this.logger.error(
        `Huỷ lời mời thất bại (id=${inviteId}): ${deleteError.message}`,
      );
      throw new InternalServerErrorException('Failed to cancel invite');
    }
    return { id: inviteId, cancelled: true };
  }

  /**
   * Mời 1 user vào tổ chức.
   *
   * Chỉ owner/admin gọi được — RolesGuard đã chặn ở tầng trên, service không
   * phải kiểm tra lại quyền.
   */
  async invite(
    orgId: string,
    fromUid: string,
    toUserId: string,
    role: InviteRole = 'member',
  ): Promise<InviteResponse> {
    if (!INVITE_ROLES.includes(role)) {
      throw new BadRequestException("role must be 'admin' or 'member'.");
    }

    // 1. Đã là thành viên rồi thì mời làm gì nữa.
    const { data: existing, error: memberError } = await this.supabase.client
      .from('organization_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('user_id', toUserId)
      .maybeSingle();

    if (memberError) {
      this.logger.error(
        `Kiểm tra thành viên thất bại (org=${orgId}): ${memberError.message}`,
      );
      throw new InternalServerErrorException('Failed to check membership');
    }
    if (existing) {
      throw new ConflictException(
        'This person is already a member of the organization.',
      );
    }

    // 2. Tạo lời mời. `from_user_id` lấy từ TOKEN, không lấy từ body — lấy từ
    //    body thì ai cũng gửi lời mời mạo danh người khác được.
    const { data, error } = await this.supabase.client
      .from('organization_invites')
      .insert({
        org_id: orgId,
        to_user_id: toUserId,
        from_user_id: fromUid,
        role,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      // Partial unique index `uniq_pending_invite` chặn mời trùng khi đang chờ.
      // Là partial (chỉ áp dụng cho status='pending') nên người đã TỪ CHỐI trước
      // đó vẫn mời lại được — đúng như mong muốn.
      if (error.code === '23505') {
        throw new ConflictException(
          'There is already a pending invite for this person.',
        );
      }
      // 23503 = vi phạm khoá ngoại: to_user_id không có trong bảng users.
      if (error.code === '23503') {
        throw new NotFoundException('User not found.');
      }
      this.logger.error(
        `Tạo lời mời thất bại (org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to create invite');
    }

    // Bắn thông báo về ĐÚNG người được mời qua WebSocket — chuông lời mời phải
    // sáng lên ngay, không bắt người ta F5 mới thấy.
    //
    // Payload có sẵn tên tổ chức + tên người mời để client vẽ được ngay, khỏi
    // phải gọi thêm GET /organizations/invites/me chỉ để lấy hai cái tên.
    const [{ data: org }, { data: from }] = await Promise.all([
      this.supabase.client
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .maybeSingle(),
      this.supabase.client
        .from('users')
        .select('display_name, email')
        .eq('id', fromUid)
        .maybeSingle(),
    ]);
    this.realtime.emitToUser(toUserId, 'invite.created', fromUid, {
      id: data.id as string,
      orgId: data.org_id as string,
      orgName: (org?.name as string) ?? '',
      role: (data.role as InviteRole) ?? 'member',
      fromUser: {
        displayName: (from?.display_name as string) ?? null,
        email: (from?.email as string) ?? '',
      },
      createdAt: data.created_at as string,
    });

    return {
      id: data.id,
      orgId: data.org_id,
      toUserId: data.to_user_id,
      fromUserId: data.from_user_id,
      role: (data.role as InviteRole) ?? 'member',
      status: data.status,
      createdAt: data.created_at,
    };
  }
}
