import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/** Postgres báo mã này khi nhận chuỗi không phải uuid vào cột kiểu uuid. */
const LOI_UUID_SAI = '22P02';

export type OrgRole = 'owner' | 'admin' | 'member';

/**
 * KIỂM TRA QUYỀN DÙNG CHUNG.
 *
 * ⚠️ Backend chạy bằng `service_role key` nên RLS bị bỏ qua HOÀN TOÀN — database
 *    không chặn giúp bất cứ điều gì. Mọi ràng buộc "chỉ đụng được dữ liệu của
 *    tổ chức mình" đều phải do code làm, ở MỌI endpoint.
 *
 * Trước đây mỗi module tự chép lại các hàm `assertBoardAccess` / `assertCardAccess`
 * gần giống nhau. Chép tay như vậy chính là chỗ đã để lọt lỗ hổng ở module cards
 * lần trước: một service quên, thế là 6 endpoint mở toang. Gom về một chỗ để
 * module mới chỉ việc gọi, không phải nhớ viết lại.
 *
 * Quy ước trả lỗi:
 *   • Không thuộc tổ chức → **404**, không phải 403. Trả 403 là vô tình xác nhận
 *     "id này có thật, chỉ là bạn không có quyền" — người ngoài cứ dò uuid, cái
 *     nào 403 là biết có tồn tại.
 *   • Thuộc tổ chức nhưng không đủ vai trò để QUẢN LÝ → 403 (lúc này họ đã thấy
 *     được dữ liệu rồi, giấu nữa cũng vô nghĩa và chỉ gây khó hiểu).
 */
@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private laUuidSai(error: { code?: string } | null): boolean {
    return error?.code === LOI_UUID_SAI;
  }

  /** Vai trò của user trong tổ chức, hoặc null nếu không thuộc. */
  async roleInOrg(uid: string, orgId: string): Promise<OrgRole | null> {
    const { data, error } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', uid)
      .maybeSingle();
    if (error && !this.laUuidSai(error)) {
      this.logger.error(`Kiểm tra quyền thất bại (uid=${uid}, org=${orgId}): ${error.message}`);
      throw new InternalServerErrorException('Failed to check permissions');
    }
    return (data?.role as OrgRole) ?? null;
  }

  async assertOrgMember(uid: string, orgId: string, notFoundMessage = 'Data not found.'): Promise<OrgRole> {
    const role = await this.roleInOrg(uid, orgId);
    if (!role) throw new NotFoundException(notFoundMessage);
    return role;
  }

  /** Chỉ owner/admin mới quản lý được (tạo/sửa/xoá workspace, board). */
  async assertCanManage(uid: string, orgId: string): Promise<OrgRole> {
    const role = await this.assertOrgMember(uid, orgId);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException('Only the organization owner or an admin can do this.');
    }
    return role;
  }

  /**
   * Người gọi có vào được board này không?
   *
   * Kiểm tra ĐỦ BA TẦNG — thiếu tầng nào là thủng tầng đó:
   *   1. board thuộc tổ chức mình không
   *   2. workspace chứa nó có `restricted` mà mình không được chỉ định không
   *   3. bản thân board có `private` mà mình không được chỉ định không
   */
  async assertBoardAccess(uid: string, boardId: string): Promise<{ boardId: string; orgId: string; workspaceId: string }> {
    if (!boardId) throw new NotFoundException('Board not found.');

    const sb = this.supabase.client;
    const { data: board, error } = await sb
      .from('boards')
      .select('id, org_id, workspace_id, visibility')
      .eq('id', boardId)
      .maybeSingle();
    if (this.laUuidSai(error) || !board) throw new NotFoundException('Board not found.');

    await this.assertOrgMember(uid, board.org_id as string, 'Board not found.');

    const { data: ws } = await sb
      .from('workspaces')
      .select('visibility')
      .eq('id', board.workspace_id as string)
      .maybeSingle();
    if ((ws?.visibility as string) === 'restricted') {
      const { data: wm } = await sb
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', board.workspace_id as string)
        .eq('user_id', uid)
        .maybeSingle();
      if (!wm) throw new NotFoundException('Board not found.');
    }

    if ((board.visibility as string) === 'private') {
      const { data: bm } = await sb
        .from('board_members')
        .select('user_id')
        .eq('board_id', boardId)
        .eq('user_id', uid)
        .maybeSingle();
      if (!bm) throw new NotFoundException('Board not found.');
    }

    return {
      boardId,
      orgId: board.org_id as string,
      workspaceId: board.workspace_id as string,
    };
  }

  /**
   * Người gọi có đụng được vào thẻ này không?
   *
   * `cards` không có `board_id` — phải đi vòng qua `lists`. Trả luôn boardId để
   * chỗ gọi dùng cho việc phát sự kiện WebSocket, khỏi tra lại lần nữa.
   */
  async assertCardAccess(uid: string, cardId: string): Promise<{ cardId: string; boardId: string; orgId: string; title: string }> {
    if (!cardId) throw new NotFoundException('Card not found.');

    const { data: card, error } = await this.supabase.client
      .from('cards')
      .select('id, org_id, title, lists(board_id)')
      .eq('id', cardId)
      .maybeSingle();
    if (this.laUuidSai(error) || !card) throw new NotFoundException('Card not found.');

    const boardId = (card.lists as unknown as { board_id: string } | null)?.board_id;
    if (!boardId) throw new NotFoundException('Card not found.');

    // Đi qua board để ăn luôn cả ba tầng kiểm tra ở trên.
    await this.assertBoardAccess(uid, boardId);

    return {
      cardId,
      boardId,
      orgId: card.org_id as string,
      title: card.title as string,
    };
  }
}
