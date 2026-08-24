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

/** Hình dạng một dòng RPC `kiem_tra_quyen_board` trả về — xem migrations/0006_*.sql. */
interface KetQuaQuyenBoard {
  allowed: boolean;
  out_board_id: string | null;
  out_org_id: string | null;
  out_workspace_id: string | null;
}

/** Hình dạng một dòng RPC `kiem_tra_quyen_the` trả về — xem migrations/0006_*.sql. */
interface KetQuaQuyenThe {
  allowed: boolean;
  out_card_id: string | null;
  out_board_id: string | null;
  out_org_id: string | null;
  out_title: string | null;
}

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
      this.logger.error(
        `Kiểm tra quyền thất bại (uid=${uid}, org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to check permissions');
    }
    return (data?.role as OrgRole) ?? null;
  }

  async assertOrgMember(
    uid: string,
    orgId: string,
    notFoundMessage = 'Data not found.',
  ): Promise<OrgRole> {
    const role = await this.roleInOrg(uid, orgId);
    if (!role) throw new NotFoundException(notFoundMessage);
    return role;
  }

  /** Chỉ owner/admin mới quản lý được (tạo/sửa/xoá workspace, board). */
  async assertCanManage(uid: string, orgId: string): Promise<OrgRole> {
    const role = await this.assertOrgMember(uid, orgId);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException(
        'Only the organization owner or an admin can do this.',
      );
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
  async assertBoardAccess(
    uid: string,
    boardId: string,
  ): Promise<{ boardId: string; orgId: string; workspaceId: string }> {
    if (!boardId) throw new NotFoundException('Board not found.');

    // Trước đây đây là 4 truy vấn NỐI TIẾP (board → tổ chức → workspace →
    // workspace_members/board_members). Đo trên máy dev: ~94ms mỗi vòng gọi
    // Supabase, nên riêng hàm này tốn ~280-370ms trên MỌI endpoint của board.
    // Gộp thành 1 hàm SQL (migrations/0006_*.sql): 4 phép JOIN đó chạy trong
    // Postgres dưới 1ms, và ứng dụng chỉ còn đi ĐÚNG MỘT chuyến khứ hồi.
    //
    // ⚠️ Logic BÊN TRONG hàm SQL đó phải giống hệt bản cũ — sửa quyền thì sửa
    //    ở CẢ HAI nơi, hoặc tốt hơn là chỉ sửa trong SQL rồi xoá code cũ hẳn.
    const { data, error } = await this.supabase.client
      .rpc('kiem_tra_quyen_board', { p_uid: uid, p_board_id: boardId })
      .maybeSingle<KetQuaQuyenBoard>();

    if (error) {
      this.logger.error(
        `RPC kiem_tra_quyen_board thất bại (uid=${uid}, board=${boardId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to check permissions');
    }
    if (!data || !data.allowed) {
      throw new NotFoundException('Board not found.');
    }

    return {
      boardId: data.out_board_id as string,
      orgId: data.out_org_id as string,
      workspaceId: data.out_workspace_id as string,
    };
  }

  /**
   * Người gọi có đụng được vào thẻ này không?
   *
   * `cards` không có `board_id` — phải đi vòng qua `lists`. Trả luôn boardId để
   * chỗ gọi dùng cho việc phát sự kiện WebSocket, khỏi tra lại lần nữa.
   */
  async assertCardAccess(
    uid: string,
    cardId: string,
  ): Promise<{
    cardId: string;
    boardId: string;
    orgId: string;
    title: string;
  }> {
    if (!cardId) throw new NotFoundException('Card not found.');

    // Bản cũ gọi lại assertBoardAccess() — tức 4 vòng thêm nữa CỘNG DỒN vào
    // vòng tra thẻ, tổng 5 chuyến khứ hồi. Hàm SQL này gọi kiem_tra_quyen_board
    // NGAY TRONG Postgres, nên vẫn ăn đủ ba tầng mà chỉ tốn 1 chuyến từ Node.
    const { data, error } = await this.supabase.client
      .rpc('kiem_tra_quyen_the', { p_uid: uid, p_card_id: cardId })
      .maybeSingle<KetQuaQuyenThe>();

    if (error) {
      this.logger.error(
        `RPC kiem_tra_quyen_the thất bại (uid=${uid}, card=${cardId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to check permissions');
    }
    if (!data || !data.allowed) {
      throw new NotFoundException('Card not found.');
    }

    return {
      cardId: data.out_card_id as string,
      boardId: data.out_board_id as string,
      orgId: data.out_org_id as string,
      title: data.out_title as string,
    };
  }
}
