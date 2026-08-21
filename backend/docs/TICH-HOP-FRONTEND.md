# Tích hợp frontend ↔ backend — phần của Huy

> Trạng thái: **8 endpoint tổ chức + 4 endpoint workspace đã nối xong và chạy thật.**
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
| Board trong workspace | `POST /boards` là phần của Hoà, chưa xong |
| Danh sách thành viên **của từng workspace** | Chưa có endpoint `workspace_members` |
| List, card, comment, chat | Phần của Hoà và Hoàng |

Trang Workspace hiện lấy **tên/mô tả từ backend**, còn **board từ localStorage**,
khoá theo đúng id workspace thật do server cấp. Khi Hoà xong, chỉ cần thay chỗ lấy
`boards` trong `loadWorkspaces()` mà không phải sửa gì thêm.

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
