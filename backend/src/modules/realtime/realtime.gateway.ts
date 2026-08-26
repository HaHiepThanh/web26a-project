import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { FirebaseAdminService } from '../../common/firebase/firebase-admin.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  BoardEvent,
  BoardEventType,
  BoardViewer,
  UserEvent,
  UserEventType,
  WS,
} from './realtime.events';

/** Dữ liệu mình gắn thêm vào mỗi socket sau khi xác thực xong. */
interface SocketData {
  uid: string;
  profile: BoardViewer;
}

function room(boardId: string): string {
  return `board:${boardId}`;
}

/**
 * Phòng riêng của từng người. Socket tự vào ngay sau khi xác thực xong, không
 * cần client xin — những việc như "có người mời bạn vào tổ chức" phải tới được
 * cả khi người ta đang ở màn hình Dashboard, chưa mở board nào.
 */
function userRoom(uid: string): string {
  return `user:${uid}`;
}

/**
 * Phòng theo TỔ CHỨC.
 *
 * Cần cho những thay đổi mà cả tổ chức phải thấy nhưng không gắn với board nào
 * — đổi avatar / đổi tên hiển thị là ví dụ đầu tiên. Trước đây chỉ có phòng
 * board và phòng cá nhân, nên B đổi avatar thì A đang đứng ở màn hình Workspace
 * không có đường nào biết, phải F5 mới thấy.
 *
 * Không phát cho TẤT CẢ socket đang kết nối: làm vậy là gửi tên và ảnh của
 * người này sang cả những người ở tổ chức khác, chẳng liên quan gì.
 */
function orgRoom(orgId: string): string {
  return `org:${orgId}`;
}

/**
 * WEBSOCKET THEO BOARD — mở board là thấy thay đổi của người khác ngay, không F5.
 *
 * ── Vì sao là Socket.IO ở backend chứ không phải Supabase Realtime ở frontend?
 * Supabase Realtime bắt frontend cầm khoá Supabase và dựa vào RLS để chặn. Kiến
 * trúc của dự án này thì ngược lại: frontend KHÔNG có khoá Supabase nào, chỉ nói
 * chuyện với backend, và backend dùng `service_role key` (bỏ qua RLS hoàn toàn).
 * Cắm Supabase Realtime vào frontend đồng nghĩa mở một đường thứ hai đi thẳng
 * xuống database, nằm ngoài mọi kiểm tra quyền mà 3 bạn đã viết.
 *
 * ── Ba lớp kiểm tra, đúng thứ tự:
 *   1. `handleConnection` — verify Firebase ID token. Không có/sai token thì
 *      ngắt kết nối ngay, chưa vào được phòng nào cả.
 *   2. `board:join` — kiểm tra người này có thuộc tổ chức của board không.
 *      ⚠️ BẮT BUỘC. Thiếu bước này thì ai đăng nhập cũng "join" được board của
 *      công ty khác chỉ bằng cách đoán uuid, rồi ngồi nghe toàn bộ chat và mọi
 *      thay đổi thẻ của họ theo thời gian thực — còn tệ hơn lỗ hổng REST vì
 *      không để lại dấu vết trong log HTTP.
 *   3. Phát tin chỉ vào đúng phòng `board:<id>`, không bao giờ broadcast toàn cục.
 */
@WebSocketGateway({
  // Cùng chính sách CORS với REST (xem main.ts).
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly firebase: FirebaseAdminService,
    private readonly supabase: SupabaseService,
  ) {}

  // ------------------------------------------------------------------ kết nối

  /**
   * Xác thực NGAY lúc bắt tay, trước khi socket làm được bất cứ điều gì.
   *
   * Token đi trong `handshake.auth` (socket.io tự gửi kèm), không phải trong URL
   * — query string bị ghi vào log của proxy/nginx, mà đây là token đăng nhập.
   */
  async handleConnection(client: Socket): Promise<void> {
    const token = (client.handshake.auth as { token?: string } | undefined)
      ?.token;
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const decoded = await this.firebase.verifyIdToken(token);
      const data: SocketData = {
        uid: decoded.uid,
        profile: {
          id: decoded.uid,
          displayName: decoded.name ?? decoded.email ?? null,
          avatarUrl: decoded.picture ?? null,
        },
      };
      client.data = data;
      // Vào phòng riêng NGAY, không chờ client xin: uid đã xác thực xong nên
      // không có gì để kiểm tra thêm, và người ta cần nhận lời mời ngay cả khi
      // chưa mở board nào.
      await client.join(userRoom(decoded.uid));

      // Vào phòng của MỌI tổ chức mình thuộc về. Truy vấn thêm một lần lúc kết
      // nối là đủ — rẻ hơn nhiều so với việc mỗi lần đổi hồ sơ lại phải đi tìm
      // xem ai cần được báo.
      const { data: toChuc } = await this.supabase.client
        .from('organization_members')
        .select('org_id')
        .eq('user_id', decoded.uid);
      for (const t of toChuc ?? []) {
        await client.join(orgRoom((t as { org_id: string }).org_id));
      }
    } catch {
      // Token hết hạn/bị sửa → cắt. Client sẽ tự kết nối lại với token mới.
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    // Socket.IO tự gỡ socket khỏi mọi phòng TRƯỚC khi gọi hàm này, nên phải đọc
    // danh sách phòng đã lưu riêng chứ không dùng client.rooms nữa.
    const joined =
      (client.data as SocketData & { boards?: string[] })?.boards ?? [];
    for (const boardId of joined) {
      void this.broadcastPresence(boardId);
    }
  }

  // ------------------------------------------------------------------ vào/rời

  @SubscribeMessage(WS.JOIN)
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { boardId?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const uid = (client.data as SocketData)?.uid;
    const boardId = body?.boardId;
    if (!uid || !boardId) return { ok: false, error: 'Missing boardId.' };

    if (!(await this.isBoardMember(uid, boardId))) {
      this.logger.warn(
        `Từ chối join board ${boardId} cho uid ${uid} (không thuộc tổ chức)`,
      );
      return { ok: false, error: 'Board not found.' };
    }

    await client.join(room(boardId));
    const data = client.data as SocketData & { boards?: string[] };
    data.boards = [...new Set([...(data.boards ?? []), boardId])];

    await this.broadcastPresence(boardId);
    return { ok: true };
  }

  @SubscribeMessage(WS.LEAVE)
  async onLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { boardId?: string },
  ): Promise<{ ok: boolean }> {
    const boardId = body?.boardId;
    if (!boardId) return { ok: false };

    await client.leave(room(boardId));
    const data = client.data as SocketData & { boards?: string[] };
    data.boards = (data.boards ?? []).filter((b) => b !== boardId);

    await this.broadcastPresence(boardId);
    return { ok: true };
  }

  // ------------------------------------------------------------------ phát tin

  /**
   * Phát 1 thay đổi cho mọi người đang mở board — TRỪ KHÔNG AI CẢ, kể cả người
   * vừa gây ra thay đổi.
   *
   * Cố tình gửi cho cả người gây ra: họ có thể đang mở board này ở tab thứ hai,
   * và tab đó cũng cần cập nhật. Phía client mọi hàm áp dụng đều theo kiểu
   * "có id rồi thì ghi đè, chưa có thì thêm" nên nhận lại thay đổi của chính
   * mình không gây nhân đôi.
   *
   * Không `await`: đây là việc phụ. Người dùng đã tạo xong cái thẻ rồi, đừng bắt
   * họ chờ thêm chỉ vì việc thông báo cho người khác.
   */
  emitToBoard<T>(
    boardId: string,
    type: BoardEventType,
    actorId: string,
    data: T,
  ): void {
    if (!boardId || !this.server) return;
    const event: BoardEvent<T> = { type, boardId, actorId, data };
    this.server.to(room(boardId)).emit(WS.EVENT, event);
  }

  /**
   * Gửi việc riêng cho ĐÚNG MỘT NGƯỜI (mọi tab họ đang mở).
   *
   * Dùng cho lời mời vào tổ chức: người nhận chưa thuộc tổ chức nên không có
   * board nào để phát vào — phải có phòng riêng theo uid.
   */
  /**
   * Phát cho mọi người trong một tổ chức. Dùng cho thay đổi cấp tổ chức không
   * gắn với board — hiện là `user.updated` khi ai đó đổi avatar/tên.
   */
  emitToOrg<T>(
    orgId: string,
    type: UserEventType,
    actorId: string,
    data: T,
  ): void {
    if (!orgId || !this.server) return;
    // ⚠️ Phải ĐÚNG hình dạng `UserEvent` như `emitToUser` — frontend đọc
    // `event.type` / `event.actorId` / `event.data`. Đặt tên khác (kiểu
    // `actorUid`/`payload`) thì sự kiện vẫn tới nơi nhưng frontend đọc ra
    // `undefined`, im lặng không báo lỗi gì.
    const event: UserEvent<T> = { type, actorId, data };
    this.server.to(orgRoom(orgId)).emit(WS.USER_EVENT, event);
  }

  emitToUser<T>(
    uid: string,
    type: UserEventType,
    actorId: string,
    data: T,
  ): void {
    if (!uid || !this.server) return;
    const event: UserEvent<T> = { type, actorId, data };
    this.server.to(userRoom(uid)).emit(WS.USER_EVENT, event);
  }

  // ------------------------------------------------------------------ nội bộ

  /** Ai đang mở board này (mỗi người tính 1 lần dù mở nhiều tab). */
  private async broadcastPresence(boardId: string): Promise<void> {
    if (!this.server) return;
    const sockets = await this.server.in(room(boardId)).fetchSockets();

    const byId = new Map<string, BoardViewer>();
    for (const s of sockets) {
      const profile = (s.data as SocketData)?.profile;
      if (profile) byId.set(profile.id, profile);
    }

    this.server.to(room(boardId)).emit(WS.PRESENCE, {
      boardId,
      viewers: [...byId.values()],
    });
  }

  /**
   * Người này có thuộc tổ chức sở hữu board không?
   *
   * Cùng một phép kiểm tra mà `assertBoardAccess` trong cards/lists/chat đang
   * dùng cho REST — WebSocket không được phép lỏng hơn REST.
   */
  private async isBoardMember(uid: string, boardId: string): Promise<boolean> {
    const sb = this.supabase.client;
    const { data: board, error } = await sb
      .from('boards')
      .select('id, org_id')
      .eq('id', boardId)
      .maybeSingle();
    // 22P02 = boardId không đúng định dạng uuid.
    if (error?.code === '22P02' || !board) return false;

    const { data: member } = await sb
      .from('organization_members')
      .select('role')
      .eq('org_id', board.org_id as string)
      .eq('user_id', uid)
      .maybeSingle();
    return !!member;
  }
}
