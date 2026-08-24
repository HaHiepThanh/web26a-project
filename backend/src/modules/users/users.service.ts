import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** Kết quả tìm kiếm — chỉ trả những trường cần để hiển thị, không trả phone/job_title. */
export interface UserSearchResult {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** true nếu người này đã cùng tổ chức với người đang tìm — giao diện ghi chú thêm. */
  sharesOrg: boolean;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

/** Query ngắn hơn ngần này thì không tìm, tránh gõ 1 chữ ra cả bảng người dùng. */
const MIN_QUERY = 3;
const MAX_RESULTS = 8;

/**
 * Query trông giống một ĐỊNH DANH (id) chứ không phải tên người?
 *
 * ⚠️ `users.id` là **Firebase uid** — chuỗi 28 ký tự chữ và số như
 *    'LtVYmqyWfFRxY2Hwj8Caw7TAgSz2', KHÔNG phải uuid có gạch ngang. Bản đầu ở
 *    đây kiểm tra bằng regex uuid nên không bao giờ khớp: dán uid của người
 *    khác vào là rơi xuống nhánh tìm theo tên, và tìm tên thì không ra gì.
 *
 * Vẫn chấp nhận cả dạng uuid để phòng khi sau này đổi cách sinh id.
 */
function laDinhDanh(q: string): boolean {
  return /^[A-Za-z0-9-]{20,}$/.test(q);
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Tìm người dùng để mời vào tổ chức / thêm vào workspace.
   *
   * ── Vì sao không cho tìm tự do toàn bộ bảng `users`?
   * Vì như thế bất kỳ ai đăng nhập cũng gõ "a" rồi lần ra danh sách email của
   * toàn hệ thống. Nên chia làm hai kiểu tìm, khắt khe khác nhau:
   *
   *   • Gõ ĐÚNG uuid hoặc ĐÚNG email  → tìm toàn hệ thống.
   *       Bạn phải biết trước chính xác định danh của người ta thì mới ra —
   *       không dò mò được. Đây chính là cách mời người ngoài tổ chức.
   *
   *   • Gõ tên / username             → CHỈ tìm trong những người đã cùng tổ
   *       chức với bạn. Đủ dùng cho ô "thêm thành viên vào workspace", mà không
   *       biến ứng dụng thành cuốn danh bạ công khai.
   *
   * ⚠️ Trước đây frontend tự tìm trong localStorage rồi BỊA ra người dùng khi
   *    không thấy: dán uuid của người khác thì hiện `User-a1b2c3d4` với email
   *    giả `a1b2c3d4@trello.dev`. Thêm vào vẫn chạy (id thật) nên lỗi này rất
   *    dễ bị bỏ qua — nhìn thì tưởng đúng người.
   */
  async search(uid: string, rawQuery: string): Promise<UserSearchResult[]> {
    const q = (rawQuery ?? '').trim();
    if (q.length < MIN_QUERY) return [];

    const sb = this.supabase.client;
    const myOrgIds = await this.orgIdsOf(uid);
    const orgMateIds = await this.userIdsInOrgs(myOrgIds);

    let rows: UserRow[] = [];

    if (laDinhDanh(q)) {
      // Biết chính xác id → cho tìm toàn hệ thống.
      const { data, error } = await sb
        .from('users')
        .select('id, email, display_name, username, avatar_url')
        .eq('id', q);
      if (error) throw this.loi(error.message);
      rows = (data ?? []) as UserRow[];
    }

    if (!rows.length && q.includes('@')) {
      // Biết chính xác email → cũng cho tìm toàn hệ thống.
      const { data, error } = await sb
        .from('users')
        .select('id, email, display_name, username, avatar_url')
        .ilike('email', q);
      if (error) throw this.loi(error.message);
      rows = (data ?? []) as UserRow[];
    }

    // Không khớp id/email chính xác → tìm theo tên, nhưng CHỈ trong người cùng
    // tổ chức. Chạy cả khi query trông giống id: uid gõ thiếu 1 ký tự thì vẫn
    // còn cơ hội ra đúng người qua tên, thay vì im lặng trả rỗng.
    if (!rows.length && !q.includes('@') && orgMateIds.length) {
      // Tìm theo tên/username — GIỚI HẠN trong người cùng tổ chức.
      const escaped = q.replace(/[%_]/g, '');
      const { data, error } = await sb
        .from('users')
        .select('id, email, display_name, username, avatar_url')
        .in('id', orgMateIds)
        .or(`display_name.ilike.%${escaped}%,username.ilike.%${escaped}%`)
        .limit(MAX_RESULTS);
      if (error) throw this.loi(error.message);
      rows = (data ?? []) as UserRow[];
    }

    const mateSet = new Set(orgMateIds);
    return rows
      .filter((r) => r.id !== uid) // không tự tìm ra chính mình
      .slice(0, MAX_RESULTS)
      .map((r) => ({
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        username: r.username,
        avatarUrl: r.avatar_url,
        sharesOrg: mateSet.has(r.id),
      }));
  }

  private loi(message: string): InternalServerErrorException {
    this.logger.error(`Tìm người dùng thất bại: ${message}`);
    return new InternalServerErrorException('Failed to search users');
  }

  /** Các tổ chức mà user này thuộc về. */
  private async orgIdsOf(uid: string): Promise<string[]> {
    const { data } = await this.supabase.client
      .from('organization_members')
      .select('org_id')
      .eq('user_id', uid);
    return (data ?? []).map((r) => r.org_id as string);
  }

  /** Mọi user thuộc các tổ chức đó (bỏ trùng). */
  private async userIdsInOrgs(orgIds: string[]): Promise<string[]> {
    if (!orgIds.length) return [];
    const { data } = await this.supabase.client
      .from('organization_members')
      .select('user_id')
      .in('org_id', orgIds);
    return [...new Set((data ?? []).map((r) => r.user_id as string))];
  }
}
