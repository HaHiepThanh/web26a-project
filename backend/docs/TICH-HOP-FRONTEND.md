# Tích hợp frontend ↔ backend — phần của Huy

> Trạng thái: **38 endpoint đã nối xong và chạy thật** — 12 của Huy (tổ chức,
> workspace) + 14 của Hoà (board, list, label) + 12 của Hoàng (card, comment,
> chat, activity).
> Mọi thao tác dưới đây đã được bấm tay trên trình duyệt và đối chiếu với Supabase.

---

## Đã nối xong

| Endpoint | Nối vào đâu ở giao diện |
|---|---|
| `POST /organizations` | Màn onboarding · nút "Tạo tổ chức mới" (sidebar & Cài đặt) |
| `GET /organizations` | Sidebar Organization · bộ chuyển tổ chức · guard định tuyến |
| `GET /organizations/:id/members` | Modal "Quản lý tổ chức" · tab Cài đặt · số "N thành viên" |
| `POST /organizations/:id/invites` | Modal "Quản lý tổ chức" · ô "Mời thành viên" |
| `GET /organizations/invites/me` | Chuông lời mời trên header |
| `PATCH /organizations/invites/:id` | Nút Đồng ý / Từ chối trong chuông |
| `DELETE /organizations/:id/members/:userId` | Nút "Xoá" cạnh mỗi thành viên |
| `PATCH /organizations/:id/members/:userId/role` | Có sẵn `changeRole()` trong service, giao diện chưa có nút |
| `GET /workspaces?orgId=` | Danh sách workspace ở trang Workspace |
| `POST /workspaces` | Nút "Tạo Workspace" |
| `PATCH /workspaces/:id` | Nút "Sửa" trên thẻ workspace |
| `DELETE /workspaces/:id` | Nút Xoá trong modal sửa workspace |

### Phần của Hoà

| Endpoint | Nối vào đâu ở giao diện |
|---|---|
| `POST /boards` | Modal "Tạo bảng" |
| `GET /boards?workspaceId=` | Danh sách bảng trong mỗi workspace |
| `GET /boards/:id` | Mở trang Board từ link |
| `PATCH /boards/:id` | Modal "Sửa bảng" · đặt quyền riêng tư lúc tạo |
| `DELETE /boards/:id` | Menu 3 chấm trên thẻ bảng → Xoá |
| `POST /lists` | Ô "Thêm danh sách" ở trang Board |
| `GET /lists?boardId=` | Các cột trên trang Board |
| `PATCH /lists/:id` | Sửa tên cột tại chỗ |
| `PATCH /lists/:id/position` | Kéo thả đổi thứ tự cột |
| `DELETE /lists/:id` | Menu cột → "Xoá danh sách" |
| `POST /labels` · `GET /labels?boardId=` | Bộ chọn nhãn trong thẻ |
| `POST`/`DELETE /labels/cards/:cardId/:labelId` | Gắn / gỡ nhãn khỏi thẻ |

> ⚠️ 4 endpoint nhãn cuối bảng **đã nối trong service nhưng chưa bấm tới được trên
> giao diện**: bộ chọn nhãn nằm trong modal chi tiết thẻ, mà thẻ là phần của Hoàng
> chưa xong. Đã kiểm chứng ở tầng API (`kiem-tra-hoa.py`, mục 11–12).

---

## Ba lỗi phải sửa mới chạy được

Ghi lại vì đều là loại "code nhìn đúng mà app vẫn hỏng".

### 1. Trang đăng nhập bằng mật khẩu vẫn là GIẢ LẬP

`pages/login/login.ts` không hề gọi Firebase. Nó chỉ `setUser()` một uuid bịa sẵn
(`8f4c2e10-9b3a-...`) rồi đi thẳng vào app. Chỉ nút Google mới xác thực thật.

Hệ quả: không có Firebase ID token → **mọi** request tới backend trả 401 → app
trông như "không có dữ liệu gì cả" và đá người dùng sang `/onboarding`.

Đã sửa: form mật khẩu gọi `auth.loginWithEmail()` thật, kèm bảng đổi mã lỗi
Firebase sang tiếng Việt (`auth/invalid-credential` → *"Email hoặc mật khẩu không đúng."*).

### 2. Firebase khôi phục phiên BẤT ĐỒNG BỘ → F5 là mất hết

Khi tải lại trang, `auth.currentUser` là `null` trong vài trăm mili-giây đầu
(Firebase đọc phiên từ IndexedDB). Trong khoảng đó `getIdToken()` trả null,
request bay đi không có header, backend trả 401 → app tưởng user không có tổ chức
nào → nhảy `/not-found` hoặc `/onboarding`.

Triệu chứng kinh điển: **đăng nhập thì đúng, F5 một cái là hỏng.**

Đã sửa ở `services/firebase.service.ts`: thêm promise `authReady` resolve tại lần
gọi `onAuthStateChanged` đầu tiên; `getIdToken()` chờ promise đó trước khi trả token.

### 3. Guard chạy đồng bộ, dữ liệu thì bất đồng bộ

`onboardingGuard` / `orgSlugGuard` gọi `ensureLoaded()` rồi đọc `organizations()`
ngay dòng sau. Dữ liệu cũ đọc từ localStorage nên đồng bộ được; giờ lấy từ API thì
không.

Đã sửa: cả 3 guard chuyển sang `async` và `await ensureLoaded()`. `ensureLoaded()`
cache promise nên nhiều guard trên cùng một route chỉ tạo đúng 1 request.

Thêm một lớp phòng thủ: nếu gọi API **hỏng** (mất mạng, backend chưa chạy),
`onboardingGuard` cho vào app kèm banner lỗi thay vì đá sang `/onboarding` — người
dùng thấy màn tạo tổ chức sẽ tưởng mất sạch dữ liệu và tạo thêm tổ chức thừa.

---

## Phần của Hoàng

| Endpoint | Nối vào đâu ở giao diện |
|---|---|
| `POST /cards` · `GET /cards?boardId=` | Ô "Thêm thẻ" · các thẻ trên board |
| `PATCH /cards/:id` | Modal chi tiết thẻ (tiêu đề, mô tả, ưu tiên, hạn, người phụ trách) |
| `PATCH /cards/:id/move` | Kéo thả thẻ giữa/trong cột |
| `DELETE /cards/:id` | Nút "Xoá thẻ" trong modal |
| `POST /comments` · `GET /comments?cardId=` | Khung bình luận trong modal thẻ |
| `DELETE /comments/:id` | Nút xoá trên bình luận của chính mình |
| `POST /chat` · `GET /chat?boardId=` | Khung chat của board |
| `GET /activity?boardId=` | Nhật ký hoạt động |

### 🔴 Lỗ hổng bảo mật trong bản gửi PR — ĐÃ SỬA

`GET /cards`, `PATCH /cards/:id`, `DELETE /cards/:id`, `GET /comments`,
`GET /chat`, `GET /activity` **không nhận `uid` và không kiểm tra quyền gì cả**.
Controller không truyền `@CurrentUser()` xuống service.

Kiểm chứng thật: tài khoản B không thuộc tổ chức nào của A vẫn

```
GET    /cards?boardId=   → 200  đọc được thẻ của A
GET    /comments?cardId= → 200  đọc được bình luận nội bộ
GET    /chat?boardId=    → 200  đọc được chat nội bộ
PATCH  /cards/:id        → 200  SỬA được thẻ của A
DELETE /cards/:id        → 200  XOÁ được thẻ của A
```

Đã sửa: thêm `assertOrgMember` / `assertBoardAccess` / `assertCardAccess` vào cả
4 service (cards, comments, chat, activity) và truyền `@CurrentUser()` từ controller.
Sau khi sửa, cả 6 trường hợp trên đều trả **404**.

### Hai điểm nữa đã sửa

- **snake_case** — cards/comments/chat/activity trả nguyên dòng Supabase. Đã đổi
  sang camelCase như phần còn lại.
- **Thiếu `userId` trong `GET /chat` và `GET /comments`** — trả tên hiển thị nhưng
  không trả id, nên frontend không biết tin nhắn nào là của mình (để căn trái/phải)
  và bình luận nào được phép xoá. Đã thêm `user_id` vào câu `select`.

---

## Ba lỗi tìm ra khi nối phần của Hoà

### 1. `DELETE /boards/:id` chặn nhầm cả chủ tổ chức — ĐÃ SỬA

Route gắn `@Roles('owner')`, nhưng `RolesGuard` tìm `orgId` ở `req.params.id` —
với route này `params.id` là **id của BOARD**. Guard mang id board đi tra
`organization_members` → không có dòng nào → **403 cho tất cả**, kể cả owner đang
xoá board của chính mình.

Đã sửa: bỏ `@Roles` khỏi route, kiểm tra vai trò trong `boards.service.remove()`
sau khi đã đọc board ra để biết `org_id` thật.

### 2. `BoardVisibility` ở frontend không khớp database — ĐÃ SỬA

Frontend khai `'public' | 'restricted'`, database và backend dùng
`'workspace' | 'private' | 'public'`. Giao diện vốn đã cho chọn đúng 3 mức nhưng
bị ép xuống còn 2. Gửi `'restricted'` lên là backend trả 400.

### 3. Thuật toán tính `position` khi kéo thả — LỖI CỦA CHÍNH BẢN TÍCH HỢP NÀY

Bản đầu tìm cột được kéo bằng "vị trí đầu tiên khác nhau giữa hai danh sách".
Sai: kéo cột đầu xuống cuối (`A B C → B C A`) thì vị trí 0 khác ngay, thuật toán
kết luận nhầm **B** di chuyển, tính ra position sai và cột nhảy ngược về chỗ cũ.

Cách đúng: bỏ thử từng cột ra khỏi **cả hai** danh sách; cột nào bỏ đi mà phần còn
lại trùng khớp thì đó là cột được kéo. Đã kiểm chứng bằng 10 tình huống (3 cột và
5 cột, kéo lên đầu / xuống cuối / vào giữa, và kéo qua lại 50 lần liên tiếp).

---

## Quy ước đặt tên: camelCase — ĐÃ THỐNG NHẤT

Ban đầu endpoint của Huy trả `camelCase`, của Hoà trả nguyên dòng Supabase nên là
`snake_case`. Nay **toàn bộ API trả camelCase**.

Mỗi service của Hoà có thêm một hàm `toBoard()` / `toList()` / `toLabel()` đổi tên
cột trước khi trả ra, kèm interface `BoardResponse` / `ListResponse` / `LabelResponse`
để chỗ khác biết chắc hình dạng dữ liệu.

```
POST /organizations   id, name, slug, ownerId, createdAt
POST /workspaces      id, orgId, name, description, createdBy, createdAt
POST /boards          id, orgId, workspaceId, name, visibility, background,
                      backgroundImagePath, createdBy, createdAt
POST /lists           id, orgId, boardId, name, position, createdAt
POST /labels          id, orgId, boardId, name, color
```

> ⚠️ **Bẫy khi viết tiếp:** trong service, biến lấy thẳng từ Supabase vẫn là
> snake_case; chỉ giá trị ĐÃ qua hàm `toXxx()` mới là camelCase. Trộn hai thứ là
> query ra `org_id = undefined` → Postgres ném 22P02 → 500. Đúng lỗi này đã xảy ra
> một lần khi chuyển đổi (ở `boards.findOne`), test bắt được ngay.

---

## Quy ước mã lỗi khi truy cập dữ liệu không thuộc về mình

Hai bạn tình cờ theo cùng một quy tắc, và nó hợp lý — giữ nguyên:

| Loại endpoint | Trả về | Vì sao |
|---|---|---|
| Danh sách theo cha mình không thuộc | **403** | Người gọi biết rõ mình đang hỏi tổ chức nào, nói thẳng là không có quyền |
| Một tài nguyên theo id | **404** | Trả 403 là vô tình xác nhận "id này có thật" → người ngoài dò được |

---

## Backend còn thiếu 4 endpoint

Giao diện đã có sẵn nút, nhưng backend chưa có route tương ứng. Hiện các nút này
báo lỗi rõ ràng thay vì sửa ngầm ở localStorage — sửa ngầm thì người dùng thấy đổi
thành công, F5 một cái là quay lại như cũ mà không hiểu vì sao.

| Thiếu | Giao diện đang có | Hiện báo gì |
|---|---|---|
| `PATCH /organizations/:id` | Ô đổi tên trong modal Quản lý tổ chức | *"Tính năng đổi tên tổ chức chưa có ở backend…"* |
| `GET /organizations/:id/invites` | Danh sách "đang chờ đồng ý" | luôn rỗng |
| `DELETE /organizations/invites/:id` | Nút "Huỷ lời mời" | *"…chưa có ở backend"* |
| `GET /users/search?q=` | Ô mời thành viên tìm theo tên/email | chỉ mời được khi **dán đúng UUID** |

Cái cuối đáng lưu ý nhất: hiện chỉ mời được bằng cách dán nguyên Firebase uid.
Muốn tìm theo email/tên thì backend phải có endpoint tra cứu người dùng.

---

## Còn nằm ở localStorage (chờ Hoà & Hoàng)

| Dữ liệu | Vì sao |
|---|---|
| **Màu nền / ảnh nền của board** | `POST /boards` chỉ nhận `workspaceId` + `name`; `PATCH` chỉ nhận `name` + `visibility` |
| Cờ đánh dấu sao board | Chưa có endpoint `board_stars` |
| Danh sách thành viên **của từng workspace** | Chưa có endpoint `workspace_members` |
| Thẻ nào đang gắn nhãn nào | Cần `GET /cards` — phần của Hoàng |
| Checklist trong thẻ | Chưa có endpoint `checklist_items` |
| Tệp đính kèm | Chưa có endpoint `card_attachments` + Supabase Storage |

Tất cả đều khoá theo **id thật do server cấp**, nên khi endpoint tương ứng có
thì chỉ cần thay chỗ đọc dữ liệu, không phải sửa cấu trúc.

---

## Cách kiểm chứng

```bash
cd backend && npm run start:dev      # cửa sổ 1
cd frontend && npm start             # cửa sổ 2
```

Mở http://localhost:4200 → đăng nhập `hocvien-a@test.dev` / `Passw0rd!`

Mở DevTools → tab Network, lọc `localhost:3000`. Phải thấy:

```
GET  /auth/me                          200
GET  /organizations                    200
GET  /organizations/invites/me         200
GET  /organizations/<id>/members       200   (mỗi tổ chức 1 request)
GET  /workspaces?orgId=<id>            200
```

Thấy **401** ở bất kỳ dòng nào → token không được gắn. Kiểm tra `backend/.env` và
xem đã đăng nhập lại chưa (token sống 1 tiếng).

Phép thử quyết định: **xoá `trello_workspaces_data` trong localStorage rồi F5.**
Workspace vẫn còn nghĩa là dữ liệu đến từ database thật.
