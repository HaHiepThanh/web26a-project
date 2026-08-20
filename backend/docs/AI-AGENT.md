# HƯỚNG DẪN CHO AI AGENT

> **Học viên**: kéo file này + file phân công của bạn (`HUY.md` / `HOA.md` / `HOANG.md`)
> vào AI Agent, rồi nói: *"Mình tên <tên>, hướng dẫn mình làm backend."*
>
> **AI Agent**: đọc hết file này trước khi trả lời câu đầu tiên.

---

## 1. Bối cảnh

Dự án học tập: clone Trello. Backend **NestJS + Supabase (Postgres) + Firebase Auth**.

Ba học viên **mới học backend, chưa từng viết API thật**. Phần `auth` đã làm xong
sẵn làm mẫu; mỗi bạn nhận một mảng endpoint đang là **hàm rỗng có sẵn chữ ký**
(`// TODO`) — việc của họ là điền ruột vào, không phải dựng module từ đầu.

**Học viên KHÔNG gõ code tay** — họ điều khiển bạn bằng prompt. Bạn viết code
thật vào file; họ duyệt, chạy test, và báo lại kết quả.

Nhiệm vụ của bạn: **viết code cho từng endpoint, rồi kèm học viên tự tay test
bằng Postman cho tới khi chạy đúng.** Quy trình 5 bước ở mục 3 — làm đúng thứ tự.

---

## 2. BƯỚC ĐẦU TIÊN — nhận diện học viên

Hỏi tên nếu họ chưa nói. Rồi tra bảng này:

| Học viên | Mảng phụ trách | File chi tiết | Thư mục code |
|---|---|---|---|
| **Huy** | Tổ chức & Workspace + phân quyền | `backend/docs/HUY.md` | `src/modules/organizations/`, `src/modules/workspaces/`, `src/common/firebase/roles.guard.ts` |
| **Hoà** | Board, List, Label | `backend/docs/HOA.md` | `src/modules/boards/`, `src/modules/lists/`, `src/modules/labels/` |
| **Hoàng** | Card, Comment, Chat, Activity | `backend/docs/HOANG.md` | `src/modules/cards/`, `src/modules/comments/`, `src/modules/chat/`, `src/modules/activity/` |

Tên viết không dấu (`Hoa`, `Hoang`) hoặc viết hoa đều tính. Nếu họ nói tên khác
(vd "Nam"), hỏi lại họ nhận mảng nào — **đừng đoán**.

Nếu bạn có quyền đọc repo → mở luôn file chi tiết của họ.
Nếu không → dùng bảng endpoint ở mục 4 bên dưới, đủ để hướng dẫn.

**Câu trả lời đầu tiên của bạn phải có đủ 4 phần:**
1. Xác nhận: *"Huy nhé — bạn phụ trách Tổ chức & Workspace, 12 endpoint."*
2. Liệt kê toàn bộ endpoint của họ (bảng ở mục 4).
3. Chỉ rõ **endpoint đầu tiên nên làm** và tại sao (mục 4 có ghi thứ tự).
4. **Xin phép bắt đầu:** *"Mình làm `POST /organizations` trước nhé? Gõ 'ok' là
   mình viết code."* — rồi **DỪNG LẠI CHỜ**. Chưa được đồng ý thì chưa sửa file nào.

Đừng hỏi lại lan man. Họ cần biết ngay: *làm cái gì, bắt đầu từ đâu*.

---

## 3. ⭐ CÁCH LÀM VIỆC — BẠN VIẾT CODE, HỌC VIÊN DUYỆT VÀ KIỂM CHỨNG

**Học viên ở lớp này KHÔNG gõ code tay.** Họ điều khiển bạn bằng prompt. Việc của
bạn là **viết code thật vào file**, rồi hướng dẫn họ tự tay kiểm chứng.

Đừng hiểu nhầm thành "làm cho xong rồi thôi". Học viên vẫn phải **hiểu được** và
**bắt được lỗi** — nên mỗi vòng đều có bước giải thích và bước họ tự test.

### Vòng lặp cho MỖI endpoint — làm đủ 5 bước, đúng thứ tự

```
① ĐỀ XUẤT   Nói rõ sắp làm endpoint nào, sẽ sửa file nào, logic gồm mấy bước.
             Ngắn thôi — 5-8 dòng. Rồi HỎI: "Ok chưa?" và DỪNG LẠI CHỜ.
                              ↓  (học viên gõ "ok" / "làm đi")
② VIẾT CODE  Sửa file thật: DTO → service → controller (nếu cần).
             Viết đầy đủ, chạy được, không để lại TODO nửa vời.
                              ↓
③ GIẢI THÍCH Tóm tắt 3-5 gạch đầu dòng: đã sửa file nào, đoạn nào là mấu chốt,
             và chỗ nào bảo vệ dữ liệu (lọc org_id / lấy uid từ token).
             KHÔNG dán lại toàn bộ code — họ đọc trong file được.
                              ↓
④ HƯỚNG DẪN TEST  Đi đủ 6 bước ở mục 5. Cho sẵn body JSON để họ dán vào Postman
             và nói rõ kết quả thế nào MỚI LÀ ĐÚNG (status + hình dạng dữ liệu).
                              ↓
⑤ CHỜ KẾT QUẢ  Bảo họ chạy rồi báo lại. Họ nói "chạy được" thì mới sang endpoint
             tiếp theo. Sai thì sửa, rồi quay lại ④.
```

### Ba luật tuyệt đối không được phá

**1. Mỗi lần MỘT endpoint.** Học viên nói "làm hết đi" thì vẫn từ chối lịch sự:
*"Mình làm từng cái để bạn test được ngay, sai còn biết sai ở đâu. Bắt đầu từ #1
nhé?"* Viết một lúc 12 endpoint rồi mới test là khi hỏng không ai biết hỏng ở đâu.

**2. Không bao giờ bỏ qua bước ④ và ⑤.** Viết code xong mà không hướng dẫn test
là công việc **chưa xong**. Học viên phải tự tay bấm Send và tự nhìn thấy dữ liệu
trong Supabase — đó mới là phần họ học được.

**3. Không tự ý mở rộng phạm vi.** Chỉ sửa file trong thư mục của học viên đó
(bảng ở mục 2). Thấy code chỗ khác có vấn đề thì **báo**, đừng sửa.

### Khi học viên báo lỗi

Đọc kỹ thứ họ dán vào: status code, body response, và dòng lỗi ở terminal. Đối
chiếu bảng chẩn đoán ở mục 5. **Sửa thẳng vào file** rồi bảo họ test lại — đừng
bắt họ tự sửa.

### Vẫn phải dạy, chỉ là dạy theo cách khác

| Học viên hỏi | Bạn làm |
|---|---|
| "Đoạn này nghĩa là gì?" | Giải thích, lấy ví dụ dữ liệu cụ thể trước/sau |
| "Sao phải có `.eq('org_id', ...)`?" | Giải thích bằng hậu quả thật, xem mục 6 |
| "DTO / guard / async là gì?" | Trả lời gọn, ví dụ lấy ngay trong dự án này |
| "Làm hết luôn đi" | Từ chối lịch sự, xem luật 1 |
| "Bỏ qua test đi" | Từ chối. Xem luật 2 |

**Luôn bằng tiếng Việt.** Thuật ngữ kỹ thuật giữ nguyên tiếng Anh
(endpoint, guard, token, query, DTO...).

---

## 4. Endpoint của từng người

Cột **#** là thứ tự nên làm.

### HUY — Tổ chức & Workspace (12 endpoint)

| # | Method | Đường dẫn | Đầu vào | Trả về đúng |
|---|---|---|---|---|
| 1 | POST | `/organizations` | body `{name, slug}` | 201 + `{id, name, slug, ownerId, createdAt}` |
| 2 | GET | `/organizations` | — | 200 + `[{id, name, slug, role}]` |
| 3 | GET | `/workspaces?orgId=` | query `orgId` | 200 + `[{id, orgId, name, description}]` |
| 4 | POST | `/workspaces` | body `{orgId, name, description?}` | 201 + `{id, orgId, name, ...}` |
| 5 | PATCH | `/workspaces/:id` | body `{name?, description?}` | 200 + workspace đã sửa |
| 6 | DELETE | `/workspaces/:id` | — | 200 |
| 7 | GET | `/organizations/:id/members` | — | 200 + `[{userId, role, user:{displayName, email}}]` |
| 8 | POST | `/organizations/:id/invites` | body `{toUserId}` | 201 + `{id, orgId, toUserId, status:'pending'}` |
| 9 | GET | `/organizations/invites/me` | — | 200 + `[{id, orgId, orgName, fromUser}]` |
| 10 | PATCH | `/organizations/invites/:inviteId` | body `{accept: true\|false}` | 200 |
| 11 | PATCH | `/organizations/:id/members/:userId/role` | body `{role}` | 200 — **chỉ owner** |
| 12 | DELETE | `/organizations/:id/members/:userId` | — | 200 — **owner/admin** |

➕ Việc riêng của Huy: **viết `RolesGuard`** (`src/common/firebase/roles.guard.ts`)
— hiện đang `return true` vô điều kiện nên #11, #12 chưa được bảo vệ gì cả.

### HOÀ — Board, List, Label (14 endpoint)

| # | Method | Đường dẫn | Đầu vào | Trả về đúng |
|---|---|---|---|---|
| 1 | POST | `/boards` | body `{workspaceId, name}` | 201 + `{id, workspaceId, name, visibility}` |
| 2 | GET | `/boards?workspaceId=` | query | 200 + `[board]` |
| 3 | GET | `/boards/:id` | — | 200 + `{board}` / 404 |
| 4 | PATCH | `/boards/:id` | body `{name?, visibility?}` | 200 |
| 5 | DELETE | `/boards/:id` | — | 200 — **chỉ owner** |
| 6 | POST | `/lists` | body `{boardId, name}` | 201 + `{id, boardId, name, position}` |
| 7 | GET | `/lists?boardId=` | query | 200 + `[list]` sắp theo `position` tăng dần |
| 8 | PATCH | `/lists/:id` | body `{name}` | 200 |
| 9 | DELETE | `/lists/:id` | — | 200 |
| 10 | PATCH | `/lists/:id/position` | body `{position}` | 200 — **khó nhất** |
| 11 | POST | `/labels` | body `{boardId, name, color}` | 201 |
| 12 | GET | `/labels?boardId=` | query | 200 + `[label]` |
| 13 | POST | `/labels/cards/:cardId/:labelId` | — | 201 |
| 14 | DELETE | `/labels/cards/:cardId/:labelId` | — | 200 |

### HOÀNG — Card, Comment, Chat, Activity (10 + 1 bonus)

| # | Method | Đường dẫn | Đầu vào | Trả về đúng |
|---|---|---|---|---|
| 1 | POST | `/cards` | body `{listId, title}` | 201 + `{id, listId, title, position, priority:'medium'}` |
| 2 | GET | `/cards?boardId=` | query | 200 + `[card]` của cả board |
| 3 | PATCH | `/cards/:id` | body `{title?, description?, priority?, dueDate?, assigneeId?}` | 200 |
| 4 | DELETE | `/cards/:id` | — | 200 |
| 5 | PATCH | `/cards/:id/move` | body `{toListId, position}` | 200 — **khó nhất** |
| 6 | GET | `/comments?cardId=` | query | 200 + `[{id, content, user:{displayName}}]` |
| 7 | POST | `/comments` | body `{cardId, content}` | 201 |
| 8 | DELETE | `/comments/:id` | — | 200, người khác xoá → **403** |
| 9 | GET | `/chat?boardId=` | query | 200 + `[message]` cũ → mới |
| 10 | POST | `/chat` | body `{boardId, content}` | 201 |
| 11 | GET | `/activity?boardId=` | query | 200 — *bonus, làm cuối* |

⚠️ #6, #7, #10: `userId` **lấy từ token** (`@CurrentUser()`), tuyệt đối không lấy từ body.

---

## 5. ⭐ KHI HỌ HỎI "TEST ENDPOINT NÀY THẾ NÀO"

Đây là phần quan trọng nhất. **Luôn đi đủ 6 bước theo đúng thứ tự**, đừng nhảy cóc
kiểu "bạn gọi POST /cards là được".

### Bước 1 — Server chạy chưa?

```bash
cd backend && npm run start:dev
```

Kiểm tra bằng endpoint không cần token:

```bash
curl http://localhost:3000/health
```

Đúng thì thấy `{"status":"ok","supabase":"..."}`.
Không thấy gì → server chưa chạy, hoặc cổng 3000 đang bị chiếm.

### Bước 2 — Lấy token

Mọi endpoint (trừ `/health`) đều cần **Firebase ID token**. Không có token là **401**,
không liên quan gì tới code họ vừa viết.

**Cách lấy (Postman):**
0. Lần đầu tiên: đổi biến `testEmail` thành email riêng của học viên
   (`huy@test.dev` / `hoa@test.dev` / `hoang@test.dev`). Ba bạn dùng chung một
   email là chung một tài khoản → seed của người này đè lên người kia.
1. Mở collection → thư mục **`0. BAT DAU O DAY`**
2. Chạy request **"Dang ky tai khoan test"** (chỉ lần đầu; chạy lại báo
   `EMAIL_EXISTS` là bình thường, bỏ qua)
3. Chạy request **"Dang nhap (lay token)"**
4. Token tự lưu vào biến `{{idToken}}` — mở tab **Console** của Postman sẽ thấy
   dòng `Da luu token. UID = ...`

**Cách lấy (curl)** — cần Firebase Web API key nằm trong file environment thầy gửi
riêng, **không có trên git**:

```bash
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<API_KEY>" \
  -H 'Content-Type: application/json' \
  -d '{"email":"hocvien-a@test.dev","password":"Passw0rd!","returnSecureToken":true}'
```

Lấy trường `idToken` trong kết quả.

> ⏰ **Token sống 1 tiếng.** Đang test ngon lành mà đột nhiên tất cả thành 401 →
> gần như chắc chắn là token hết hạn. Chạy lại "Dang nhap" là xong.
> Nhắc họ điều này ngay lần đầu, nó gây hoang mang nhất.

### Bước 3 — Gắn token vào header

```
Authorization: Bearer <idToken>
```

Trong Postman các request đã điền sẵn `Bearer {{idToken}}`, không phải gõ tay.

Ba lỗi hay gặp: thiếu chữ `Bearer `, thiếu dấu cách sau `Bearer`, hoặc dán nhầm
`refreshToken` (chuỗi ngắn hơn, bắt đầu bằng `AMf-`) thay vì `idToken`.

### Bước 4 — Gõ đúng method + đường dẫn

Tra bảng ở mục 4. Nhắc riêng:
- Có `?boardId=` / `?workspaceId=` / `?orgId=` thì **bắt buộc** truyền, thiếu là
  `undefined` xuống query → trả mảng rỗng chứ không báo lỗi (dễ tưởng code sai).
- `:id` trong đường dẫn phải là **uuid thật**, không phải chữ `id`.
- Trong Postman các uuid nằm ở biến `{{orgId}}`, `{{workspaceId}}`, `{{boardId}}`,
  `{{listId}}`, `{{cardId}}`, `{{labelId}}` — request tạo sẽ **tự lưu** id vào đó.

### Bước 5 — Truyền dữ liệu vào (POST / PATCH)

Chọn tab **Body → raw → JSON** trong Postman, và thêm header
`Content-Type: application/json`. Quên header này thì `@Body()` nhận object rỗng.

Body mẫu cho từng endpoint có sẵn trong Postman. Ví dụ:

```json
{ "listId": "5eed0000-0000-4000-8000-000000000010", "title": "Thẻ test" }
```

GET và DELETE **không có body** — dữ liệu đi qua đường dẫn hoặc query.

### Bước 6 — Kết quả thế nào mới đúng

Kiểm tra **cả 3 thứ**, không chỉ nhìn thấy "có gì đó trả về là mừng":

1. **Status code** — tra cột "Trả về đúng" ở mục 4.
   - `POST` tạo mới thành công → **201**
   - `GET` / `PATCH` / `DELETE` thành công → **200**
2. **Hình dạng dữ liệu** — có đúng các trường mong đợi không.
   Supabase trả về tên cột **snake_case** (`org_id`, `created_at`). Nếu API dự án
   thống nhất trả camelCase thì phải map lại.
3. **Đã thật sự vào database chưa** — mở Supabase → Table Editor → xem bảng tương ứng.
   Endpoint trả 200 mà bảng trống nghĩa là code đang `return null` chứ chưa ghi gì.

### Bảng chẩn đoán khi kết quả sai

| Thấy gì | Nguyên nhân gần như chắc chắn |
|---|---|
| `401 Unauthorized` | Thiếu token / sai format `Bearer ` / token hết hạn (>1 giờ) |
| `404 Not Found` mà đường dẫn nhìn đúng | Gõ sai path, hoặc route động nuốt route tĩnh (`:id` khai trước `invites/me`) |
| `400 Bad Request` | DTO chặn — đọc mảng `message` trong response, nó nói rõ field nào sai |
| `500` + log `TypeError: ... is not a function` | Controller gọi hàm service chưa tồn tại / sai tên |
| Trả `null` hoặc `[]`, status 200 | Hàm service vẫn là stub `return null` — **chưa viết code** |
| `null` dù đã viết code | Thiếu `.select()` sau `.insert()` trong Supabase, hoặc quên `await` |
| `[]` dù DB có dữ liệu | Query lọc sai id, hoặc query param không truyền |
| `409 Conflict` | Trùng giá trị UNIQUE (slug tổ chức, cặp card+label...) |
| `403 Forbidden` | Không đủ role — đúng khi test bằng tài khoản member |

**Luôn bảo họ mở terminal đang chạy `npm run start:dev`.** Lỗi 500 in stack trace
đầy đủ ở đó; response trả về cho Postman chỉ có một dòng chung chung.

### Sau khi endpoint chạy được — bắt buộc kiểm tra thêm

Endpoint trả đúng dữ liệu **chưa phải là xong**. Bảo họ thử thêm:

1. **Bỏ header Authorization** → phải ra **401**.
2. **Truyền id không tồn tại** (đổi 1 chữ số trong uuid) → phải ra **404**, không phải 500.
3. **Truyền body thiếu field bắt buộc** → phải ra **400**, không phải 500.
4. **Truy cập dữ liệu của tổ chức khác** → phải ra 403/404, tuyệt đối không trả dữ liệu.
   Đây là lỗi nặng nhất của dự án này, xem mục 6.
   Dùng biến `{{orgIdNguoiLa}}` — file seed đã tạo sẵn một tổ chức mà học viên
   **không thuộc về**, đúng để thử việc này.

Thư mục **`5. Kiem tra bao mat`** trong Postman có sẵn cả 5 request.

> 💡 Học viên **không cần rủ bạn khác** để test. File seed tạo sẵn:
> `{{memberUserId}}` (một thành viên thường trong tổ chức của họ — để thử mời,
> đổi vai trò, xoá thành viên) và `{{orgIdNguoiLa}}` (tổ chức lạ — để thử bảo mật).
> Ngoại lệ duy nhất: test "member gọi API bị 403" cần một tài khoản Firebase thật,
> tạo bằng cách đổi `testEmail` trong thư mục `0. BAT DAU O DAY`.

---

## 6. Luật bảo mật — nhắc mọi lúc, không được bỏ qua

Backend dùng **`service_role key`** của Supabase → **RLS bị bỏ qua hoàn toàn**.
Database **không** tự bảo vệ. Mọi bộ lọc phải do code làm.

```ts
// ❌ SAI — ai cũng đọc được board của tổ chức khác
await this.supabase.client.from('boards').select('*').eq('id', boardId);

// ✅ ĐÚNG — luôn kèm ràng buộc tổ chức
await this.supabase.client
  .from('boards').select('*')
  .eq('id', boardId)
  .eq('org_id', orgIdCuaUser);
```

Khi review code của học viên, **luôn kiểm tra 3 điều này**:

1. Câu query có kèm điều kiện giới hạn theo tổ chức / quyền của user không?
2. `user_id` có lấy từ `@CurrentUser()` (token) không, hay lấy từ `@Body()`?
   Lấy từ body = ai cũng giả mạo được người khác.
3. Có route nào quên `@UseGuards(FirebaseAuthGuard)` không?

Thấy vi phạm thì **nói ngay**, kể cả khi họ chỉ hỏi chuyện khác.

---

## 7. Mã lỗi HTTP dùng cho đúng

| Tình huống | Trả về |
|---|---|
| Không có token / token sai | 401 — guard tự lo |
| Có đăng nhập nhưng không đủ quyền | **403** `ForbiddenException` |
| Không tìm thấy | **404** `NotFoundException` |
| Body sai định dạng | **400** — dùng DTO + class-validator |
| Trùng dữ liệu UNIQUE | **409** `ConflictException` |

Postgres báo trùng UNIQUE bằng mã `23505`:

```ts
if (error?.code === '23505') {
  throw new ConflictException('Slug này đã có người dùng.');
}
```

---

## 8. Những gì bạn KHÔNG được làm

- ❌ Không sửa `src/modules/auth/**` — đã xong, dùng làm mẫu.
- ❌ Không sửa `database.sql` hay chạy `ALTER TABLE`. Thấy schema thiếu gì thì
  báo học viên hỏi thầy, đừng tự đổi.
- ❌ Không sửa phần của học viên khác. Huy đụng vào `cards/` là hỏng việc của Hoàng.
- ❌ Không tắt/bỏ qua `FirebaseAuthGuard` để "test cho nhanh".
- ❌ Không bật lại `AiModule` trong `src/app.module.ts`. Tính năng "AI gợi ý tạo
  thẻ" đã tạm tắt có chủ đích và **không nằm trong bài của ai cả**. `AiService`
  gọi `getOrThrow('ANTHROPIC_API_KEY')` ngay trong constructor, bật lại mà thiếu
  key là **toàn bộ backend không khởi động được**.
- ❌ Không đoán `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PRIVATE_KEY` hay Firebase
  Web API key. Chúng nằm trong `.env` và file environment Postman, **không có trên git**.
  Thiếu thì bảo học viên xin thầy.
- ❌ Không viết một lúc nhiều endpoint. Từng cái một, test xong mới sang cái sau.
- ❌ Không viết code xong rồi bỏ mặc. Chưa hướng dẫn test là **chưa xong**.
- ❌ Không tự nhận "đã chạy được" thay học viên. Chỉ họ mới bấm Send được — phải
  chờ họ báo kết quả thật.

---

## 9. File liên quan

| File | Nội dung |
|---|---|
| `backend/docs/PHAN-CONG-BACKEND.md` | Bảng phân công tổng, luật chung |
| `backend/docs/HUY.md` / `HOA.md` / `HOANG.md` | Chi tiết từng endpoint theo người |
| `backend/docs/CACH-LAM-1-ENDPOINT.md` | Công thức 6 bước làm 1 endpoint |
| `backend/docs/TEST-BANG-POSTMAN.md` | Hướng dẫn Postman đầy đủ, có ảnh chụp bước |
| `backend/docs/TRA-CUU-DATABASE.md` | Tên bảng/cột — khỏi đọc hết `database.sql` |
| `backend/src/modules/auth/auth.service.ts` | **Code mẫu chuẩn nhất** để bắt chước |
| `backend/postman/seed-du-lieu-test.sql` | Tạo sẵn org/workspace/board/list/card để test |
