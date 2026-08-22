# WebSocket — realtime theo board

> Mở board là thấy thay đổi của người khác ngay, không phải F5.

Phần này **không nằm trong bài của Huy / Hoà / Hoàng**. Nó được thêm sau khi 3 bạn
hoàn thành REST, vì một website làm việc nhóm mà phải tải lại trang mới thấy tin
nhắn của đồng đội thì không dùng được.

---

## 1. Vì sao là Socket.IO ở backend, không phải Supabase Realtime ở frontend?

File `frontend/src/app/services/realtime.service.ts` ban đầu là một stub ghi
"subscribe `postgres_changes` của Supabase". Làm theo hướng đó thì **frontend
phải cầm khoá Supabase** và dựa vào RLS để chặn.

Nhưng cả dự án này được xây theo hướng ngược lại:

| | Kiến trúc dự án | Supabase Realtime ở frontend |
|---|---|---|
| Khoá Supabase ở frontend | **không có** | bắt buộc phải có |
| Ai kiểm tra quyền | backend (`assertBoardAccess`...) | RLS dưới database |
| Backend dùng khoá gì | `service_role` — **RLS bị bỏ qua hoàn toàn** | — |

Dòng cuối là điểm chốt: vì backend dùng `service_role key`, database **không
chặn gì cả**, toàn bộ ràng buộc nằm trong code mà 3 bạn đã viết. Cắm Supabase
Realtime vào frontend là mở một đường thứ hai đi thẳng xuống database, **nằm
ngoài mọi chốt chặn đó**.

Nên: WebSocket do backend NestJS phục vụ (Socket.IO), đi qua đúng những phép
kiểm tra quyền mà REST đang dùng.

---

## 2. Ba lớp kiểm tra

Xem `src/modules/realtime/realtime.gateway.ts`.

1. **Lúc bắt tay** (`handleConnection`) — verify Firebase ID token. Không token
   hoặc token sai → ngắt ngay, chưa vào được phòng nào.
   Token đi trong `handshake.auth`, **không** trong query string: query string bị
   ghi vào log của proxy/nginx, mà đây là token đăng nhập.

2. **Lúc vào phòng** (`board:join`) — kiểm tra người này có thuộc tổ chức của
   board không.
   ⚠️ **Bắt buộc.** Thiếu bước này thì ai đăng nhập cũng "join" được board của
   công ty khác chỉ bằng cách đoán uuid, rồi ngồi nghe toàn bộ chat và mọi thay
   đổi thẻ theo thời gian thực — còn tệ hơn lỗ hổng ở REST vì không để lại dấu
   vết nào trong log HTTP.

3. **Lúc phát tin** — chỉ phát vào đúng phòng `board:<id>`, không bao giờ
   broadcast toàn cục.

---

## 3. Hợp đồng sự kiện

Hai file phải giống hệt nhau — sửa bên nào phải sửa cả bên kia:

- `backend/src/modules/realtime/realtime.events.ts`
- `frontend/src/app/models/realtime.model.ts`

### Client → server

| Sự kiện | Body | Trả về |
|---|---|---|
| `board:join` | `{ boardId }` | `{ ok: true }` hoặc `{ ok: false, error }` |
| `board:leave` | `{ boardId }` | `{ ok: true }` |

### Server → client

| Sự kiện | Payload |
|---|---|
| `board:event` | `{ type, boardId, actorId, data }` |
| `board:presence` | `{ boardId, viewers: [{ id, displayName, avatarUrl }] }` |

Chỉ có **một** tên sự kiện dữ liệu (`board:event`), phân loại bằng trường `type`.
Nếu đặt mỗi loại một tên riêng thì client phải nhớ đăng ký đủ 16 listener — quên
một cái là im lặng hỏng, không có lỗi nào báo. Gộp một chỗ thì frontend chỉ có 1
`switch`, thiếu nhánh nào TypeScript báo ngay.

### 16 giá trị của `type`

```
list.created    list.updated    list.deleted
card.created    card.updated    card.moved      card.deleted
label.created   label.attached  label.detached
comment.created comment.deleted
chat.message    activity.created
board.updated   board.deleted
```

---

## 4. Hai điểm dễ làm sai

### 4.1. Người gây ra thay đổi cũng nhận lại sự kiện của chính mình

Đây là **cố ý**, không phải lỗi. Cùng một người có thể mở board ở tab thứ hai, và
tab đó cũng cần cập nhật.

Hệ quả: mọi hàm `applyRemote*` ở frontend phải là **"có id rồi thì ghi đè, chưa
có thì thêm"**, không phải "thêm mới". Viết kiểu "thêm mới" thì người tạo thẻ sẽ
thấy thẻ của mình hiện hai lần.

### 4.2. `card.moved` làm đổi `listId`

`CardService.applyRemoteCard` phải **gỡ thẻ khỏi mọi cột trước** rồi mới thêm vào
cột đích. Chỉ ghi đè tại chỗ thì thẻ ở lại cột cũ và mọc thêm một bản ở cột mới.

---

## 5. Cách chạy thử

```bash
cd backend
npm run start:dev              # cửa sổ 1
npm run kiem-tra:websocket     # cửa sổ 2 — 34 phép thử
```

Bộ này tự dựng board riêng, mở WebSocket thật, gọi REST rồi kiểm tra sự kiện có
về đúng phòng không, cuối cùng dọn sạch. Quan trọng nhất là mục 2 (bảo mật) và
mục 5 (sự kiện không rò ra ngoài phòng).

Chạy cả 4 bộ (Huy + Hoà + Hoàng + WebSocket):

```bash
npm run kiem-tra
```

---

## 6. Frontend dùng như thế nào

```ts
// Trang Board
private readonly realtime = inject(RealtimeService);

constructor() {
  const roiPhong = this.realtime.joinBoard(this.boardId);
  inject(DestroyRef).onDestroy(roiPhong);   // ⚠️ bắt buộc
}

readonly viewers = this.realtime.viewers;             // ai đang mở board
readonly realtimeConnected = this.realtime.connected; // mất kết nối thì báo
```

Quên gọi hàm dọn dẹp thì mở lần lượt 5 board là đang lắng nghe cùng lúc cả 5.

`RealtimeService` **tự áp thay đổi** vào ListService / CardService / LabelService /
CommentService / ChatService / ActivityService / BoardService. Component không
phải xử lý gì thêm — cùng một board có thể mở ở nhiều nơi (trang Board, khung chat
Dashboard), gom một chỗ thì chỉ có đúng một nơi biết cách áp mỗi loại sự kiện.

### Token hết hạn

Firebase ID token chỉ sống 1 giờ. `RealtimeService` truyền **hàm** vào `auth` chứ
không phải chuỗi — socket.io gọi lại hàm đó ở mỗi lần kết nối, kể cả lần tự kết
nối lại, nên luôn lấy được token mới. Truyền chuỗi thì sau 1 giờ mọi lần nối lại
đều bị server ngắt.
