import {
  GoneException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AccessService } from '../../common/access/access.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Hạn mặc định nếu người tạo không chọn. */
const SO_NGAY_MAC_DINH = 7;

/**
 * 32 byte ngẫu nhiên → 43 ký tự base64url.
 *
 * Không dùng uuid: uuid v4 chỉ có 122 bit ngẫu nhiên và ở một số hệ thống còn
 * suy ra được theo thời điểm tạo. Link mời là thứ AI CẦM CŨNG VÀO ĐƯỢC, nên nó
 * là mật khẩu chứ không phải mã định danh — phải sinh bằng nguồn ngẫu nhiên mã
 * hoá và phải dài.
 */
const SO_BYTE_TOKEN = 32;

interface LinkRow {
  id: string;
  org_id: string;
  token: string;
  role: 'admin' | 'member';
  expires_at: string;
  max_uses: number | null;
  used_count: number;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
}

export interface InviteLinkResponse {
  id: string;
  orgId: string;
  token: string;
  role: 'admin' | 'member';
  expiresAt: string;
  maxUses: number | null;
  usedCount: number;
  revokedAt: string | null;
  createdBy: string;
  createdAt: string;
  /** Còn dùng được không — tính sẵn ở server để frontend khỏi tự suy. */
  active: boolean;
}

/** Thông tin cho màn "Bạn được mời vào ..." trước khi người ta bấm Tham gia. */
export interface InviteLinkPreview {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: 'admin' | 'member';
  expiresAt: string;
  /** Người bấm đã là thành viên sẵn rồi — frontend đưa thẳng vào tổ chức. */
  alreadyMember: boolean;
}

function toLink(r: LinkRow): InviteLinkResponse {
  return {
    id: r.id,
    orgId: r.org_id,
    token: r.token,
    role: r.role,
    expiresAt: r.expires_at,
    maxUses: r.max_uses,
    usedCount: r.used_count,
    revokedAt: r.revoked_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    active: conSong(r),
  };
}

/** Một link còn dùng được khi: chưa thu hồi, chưa hết hạn, chưa hết lượt. */
function conSong(r: LinkRow): boolean {
  if (r.revoked_at) return false;
  if (new Date(r.expires_at).getTime() <= Date.now()) return false;
  if (r.max_uses !== null && r.used_count >= r.max_uses) return false;
  return true;
}

/**
 * LINK MỜI VÀO TỔ CHỨC, CÓ THỜI HẠN.
 *
 * Khác `organization_invites` (mời đích danh một userId đã biết): link này ai
 * cầm cũng dùng được, nên mọi ràng buộc phải nằm ở SERVER.
 *
 * ⚠️ Backend chạy bằng `service_role key` nên RLS bị bỏ qua hoàn toàn. Không có
 *    tầng nào chặn giúp — hạn dùng, số lượt, thu hồi đều do code này kiểm.
 */
@Injectable()
export class InviteLinksService {
  private readonly logger = new Logger(InviteLinksService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Tạo link mới. Chỉ owner/admin.
   *
   * Hạn do SERVER tính từ số ngày client gửi lên, không nhận mốc tuyệt đối —
   * nhận mốc thì đồng hồ client sai hoặc client cố tình gửi mốc xa là link sống
   * lâu hơn ý định.
   */
  async create(
    uid: string,
    orgId: string,
    opts: {
      expiresInDays?: number;
      role?: 'admin' | 'member';
      maxUses?: number;
    },
  ): Promise<InviteLinkResponse> {
    await this.access.assertCanManage(uid, orgId);

    const soNgay = opts.expiresInDays ?? SO_NGAY_MAC_DINH;
    const expiresAt = new Date(
      Date.now() + soNgay * 24 * 60 * 60 * 1000,
    ).toISOString();
    const token = randomBytes(SO_BYTE_TOKEN).toString('base64url');

    const { data, error } = await this.supabase.client
      .from('organization_invite_links')
      .insert({
        org_id: orgId,
        token,
        role: opts.role ?? 'member',
        expires_at: expiresAt,
        max_uses: opts.maxUses ?? null,
        created_by: uid,
      })
      .select()
      .single();

    if (error || !data) {
      this.logger.error(
        `Tạo link mời thất bại (org=${orgId}): ${error?.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to create the invite link.',
      );
    }
    return toLink(data as LinkRow);
  }

  /** Danh sách link của tổ chức. Chỉ owner/admin — token là bí mật. */
  async findAll(uid: string, orgId: string): Promise<InviteLinkResponse[]> {
    if (!orgId) return [];
    await this.access.assertCanManage(uid, orgId);

    const { data, error } = await this.supabase.client
      .from('organization_invite_links')
      .select()
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) {
      throw new InternalServerErrorException('Failed to load invite links.');
    }
    return (data as LinkRow[]).map(toLink);
  }

  /**
   * Thu hồi link trước hạn.
   *
   * Đặt `revoked_at` chứ không XOÁ dòng: xoá đi thì mất luôn nhật ký ai đã vào
   * bằng link nào, mà đó chính là thứ cần khi soát lại về sau.
   */
  async revoke(uid: string, linkId: string): Promise<{ ok: true }> {
    const link = await this.layTheoId(linkId);
    await this.access.assertCanManage(uid, link.org_id);

    if (link.revoked_at) return { ok: true }; // thu hồi hai lần cũng không sao

    const { error } = await this.supabase.client
      .from('organization_invite_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', linkId);
    if (error) {
      throw new InternalServerErrorException(
        'Failed to revoke the invite link.',
      );
    }
    return { ok: true };
  }

  /**
   * Xem trước khi tham gia: "Bạn được mời vào tổ chức X với quyền Y".
   *
   * Cần đăng nhập mới xem được. Không mở cho khách vãng lai vì như vậy là bất kỳ
   * ai có link cũng đọc được TÊN tổ chức mà không cần tài khoản.
   */
  async preview(uid: string, token: string): Promise<InviteLinkPreview> {
    const link = await this.layTheoToken(token);
    this.chanNeuHetHan(link);

    const { data: org } = await this.supabase.client
      .from('organizations')
      .select('id, name, slug')
      .eq('id', link.org_id)
      .maybeSingle();
    if (!org) throw new NotFoundException('Invite link not found.');

    const role = await this.access.roleInOrg(uid, link.org_id);
    return {
      orgId: org.id as string,
      orgName: org.name as string,
      orgSlug: org.slug as string,
      role: link.role,
      expiresAt: link.expires_at,
      alreadyMember: role !== null,
    };
  }

  /**
   * Dùng link để vào tổ chức.
   *
   * ⚠️ Thứ tự ở đây có chủ đích: kiểm hạn → kiểm đã là thành viên chưa → GIÀNH
   *    một lượt → mới thêm vào tổ chức. Giành lượt trước bằng câu UPDATE có điều
   *    kiện, nên hai người bấm cùng lúc trên link `maxUses: 1` thì chỉ đúng một
   *    người ăn được lượt, người kia nhận 410.
   */
  async accept(
    uid: string,
    token: string,
  ): Promise<{ orgId: string; orgSlug: string; role: 'admin' | 'member' }> {
    const link = await this.layTheoToken(token);
    this.chanNeuHetHan(link);

    const sb = this.supabase.client;

    const { data: org } = await sb
      .from('organizations')
      .select('id, slug')
      .eq('id', link.org_id)
      .maybeSingle();
    if (!org) throw new NotFoundException('Invite link not found.');

    // Đã là thành viên → trả về bình thường, KHÔNG tiêu một lượt. Bấm nhầm link
    // hai lần không được phép làm cạn link của cả đội.
    const daCo = await this.access.roleInOrg(uid, link.org_id);
    if (daCo) {
      return {
        orgId: link.org_id,
        orgSlug: org.slug as string,
        role: link.role,
      };
    }

    await this.gianhMotLuot(link);

    const { error: memberError } = await sb
      .from('organization_members')
      .insert({ org_id: link.org_id, user_id: uid, role: link.role });
    if (memberError) {
      // Không trả lại lượt đã giành: hai người đua nhau mà một người hỏng thì
      // trả lượt lại có thể cho người thứ ba lọt qua giới hạn. Thà chặt hơn ý
      // muốn còn hơn lỏng hơn.
      this.logger.error(
        `Thêm thành viên qua link thất bại (org=${link.org_id}): ${memberError.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to join the organization.',
      );
    }

    await sb
      .from('organization_invite_link_uses')
      .insert({ link_id: link.id, user_id: uid });

    // Bắn cho CHÍNH người vừa vào, không phải cho cả tổ chức: họ có thể đang mở
    // sẵn app ở tab khác, và tab đó cần thấy tổ chức mới mà không phải F5.
    this.realtime.emitToUser(uid, 'invite.responded', uid, {
      orgId: link.org_id,
      accepted: true,
      via: 'link',
    });

    return { orgId: link.org_id, orgSlug: org.slug as string, role: link.role };
  }

  // ─────────────────────────────────────────────────────────── nội bộ

  private async layTheoId(linkId: string): Promise<LinkRow> {
    if (!linkId) throw new NotFoundException('Invite link not found.');
    const { data, error } = await this.supabase.client
      .from('organization_invite_links')
      .select()
      .eq('id', linkId)
      .maybeSingle();
    // 22P02 = id gõ sai định dạng uuid → coi như không tồn tại, đừng thành 500.
    if (error?.code === '22P02' || !data)
      throw new NotFoundException('Invite link not found.');
    return data as LinkRow;
  }

  private async layTheoToken(token: string): Promise<LinkRow> {
    if (!token || token.length < 20)
      throw new NotFoundException('Invite link not found.');
    const { data } = await this.supabase.client
      .from('organization_invite_links')
      .select()
      .eq('token', token)
      .maybeSingle();
    if (!data) throw new NotFoundException('Invite link not found.');
    return data as LinkRow;
  }

  /**
   * Hết hạn / bị thu hồi / hết lượt → **410 Gone**, không phải 404.
   *
   * Người cầm link đã có sẵn bí mật rồi nên phân biệt "sai" với "hết hạn" không
   * làm lộ thêm gì, mà lại nói đúng chuyện cho người dùng: "link này đã hết hạn,
   * xin người mời gửi link mới" thay vì "không tìm thấy".
   */
  private chanNeuHetHan(link: LinkRow): void {
    if (link.revoked_at) {
      throw new GoneException('This invite link has been revoked.');
    }
    if (new Date(link.expires_at).getTime() <= Date.now()) {
      throw new GoneException('This invite link has expired.');
    }
    if (link.max_uses !== null && link.used_count >= link.max_uses) {
      throw new GoneException('This invite link has reached its usage limit.');
    }
  }

  /**
   * Giành một lượt bằng UPDATE có điều kiện — chốt chống đua duy nhất ở đây.
   *
   * `used_count = used_count + 1` kèm `.lt('used_count', max_uses)` chạy nguyên
   * tử trong Postgres. Nếu đọc rồi mới ghi (read-then-write) thì hai request
   * song song cùng đọc `used_count = 0` và cùng ghi `1` — link `maxUses: 1` cho
   * lọt hai người.
   */
  private async gianhMotLuot(link: LinkRow): Promise<void> {
    const sb = this.supabase.client;

    let q = sb
      .from('organization_invite_links')
      .update({ used_count: link.used_count + 1 })
      .eq('id', link.id)
      .eq('used_count', link.used_count) // ⚠️ chốt: chỉ ăn khi chưa ai đổi
      .is('revoked_at', null);

    if (link.max_uses !== null) q = q.lt('used_count', link.max_uses);

    const { data, error } = await q.select();
    if (error) {
      throw new InternalServerErrorException('Failed to use the invite link.');
    }
    if (!data || data.length === 0) {
      throw new GoneException(
        'This invite link has just been used up or revoked.',
      );
    }
  }
}
