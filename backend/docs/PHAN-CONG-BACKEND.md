# Phân công backend — Huy, Hoà, Hoàng

> **Đợt này chỉ làm backend.** Viết code → test bằng **Postman** → kiểm chứng
> bằng **Supabase → Table Editor**. Không cần chạy frontend, không cần `ng serve`.
>
> **Cách làm:** các bạn không gõ code tay — điều khiển AI Agent bằng prompt.
> AI viết code, bạn **duyệt, tự chạy test và tự kiểm chứng dữ liệu**. Vì thế phần
> quan trọng nhất của bạn là **đọc hiểu tài liệu để biết AI làm đúng hay sai**,
> chứ không phải nhớ cú pháp.

Phần `auth` (3 endpoint) **đã làm xong** — dùng làm mẫu tham khảo, đừng sửa.

---

> 🚀 **Lần đầu vào dự án?** Đọc [`BAT-DAU.md`](BAT-DAU.md) trước — 9 bước từ
> `git fetch` đến lúc gõ dòng code đầu tiên.

## 📌 Bắt đầu ở đâu

**Mỗi bạn chỉ cần đọc 1 file của mình:**

| Bạn | File | Mảng | Số endpoint |
|---|---|---|---|
| **Huy** | 👉 [`HUY.md`](HUY.md) | Tổ chức & Workspace + phân quyền | 12 + `RolesGuard` |
| **Hoà** | 👉 [`HOA.md`](HOA.md) | Board, List, Label | 14 |
| **Hoàng** | 👉 [`HOANG.md`](HOANG.md) | Card, Comment, Chat, Activity | 10 + 1 bonus |

**Kèm AI Agent:** mở [`PROMPT.md`](PROMPT.md), copy prompt mở đầu, thay `<TÊN>`
bằng tên mình rồi dán vào AI Agent. Agent sẽ tự biết bạn làm endpoint nào, nên bắt
đầu từ đâu, và hướng dẫn test từng cái.

---

## Cách chia việc

|  | Huy | Hoà | Hoàng |
|---|---|---|---|
| **Mảng** | Tổ chức & Workspace | Board, List, Label | Card, Comment, Chat, Activity |
| **Endpoint** | 12 | 14 | 10 (+1 bonus) |
| **Thư mục** | `organizations/`, `workspaces/`, `common/firebase/roles.guard.ts` | `boards/`, `lists/`, `labels/` | `cards/`, `comments/`, `chat/`, `activity/` |
| **Việc khó nhất** | Phân quyền owner/admin/member | Sắp xếp lại thứ tự cột | Kéo thẻ sang cột khác |

**Vì sao chia thế này:**

- **Huy** nhận phần nặng nhất. Không phải vì nhiều endpoint mà vì `RolesGuard` là
  lớp bảo mật cốt lõi — viết sai là thủng cả hệ thống, không riêng phần của Huy.
  Thêm nữa, cả nhóm chờ Huy: có workspace mới có board, có board mới có thẻ.
- **Hoà** nhiều endpoint nhất nhưng phần lớn là CRUD lặp cùng một khuôn. Làm xong
  board thì list và label chỉ là chép lại đổi tên bảng.
- **Hoàng** ít endpoint nhất và phần lớn là leaf feature — không ai chờ Hoàng cả,
  nên có sai cũng không chặn tiến độ nhóm. Tài liệu của Hoàng cũng chi tiết nhất,
  gần như có sẵn code để đối chiếu xem AI Agent viết đúng chưa.

---

## Tài liệu chung — ai cũng nên đọc

| File | Khi nào đọc |
|---|---|
| [`CACH-LAM-1-ENDPOINT.md`](CACH-LAM-1-ENDPOINT.md) | **Đọc trước tiên.** Công thức 6 bước làm 1 endpoint, dùng cho cả 36 cái. |
| [`TEST-BANG-POSTMAN.md`](TEST-BANG-POSTMAN.md) | Khi cần lấy token / test / gặp lỗi lạ |
| [`TRA-CUU-DATABASE.md`](TRA-CUU-DATABASE.md) | Khi cần biết tên bảng, tên cột, giá trị hợp lệ |
| [`BAT-DAU.md`](BAT-DAU.md) | **Cài đặt lần đầu** — 9 bước, đọc trước tiên |
| [`PROMPT.md`](PROMPT.md) | **Prompt để dán vào AI Agent** — copy là chạy |
| [`AI-AGENT.md`](AI-AGENT.md) | Dành cho AI Agent đọc, không phải cho bạn |

---

## Luật chung — ai cũng phải theo

### 1. Mọi query BẮT BUỘC kèm điều kiện tổ chức

Backend dùng **`service_role key`** nên **RLS bị bỏ qua hoàn toàn** — database
không tự bảo vệ. Quên một chỗ là user tổ chức này đọc được dữ liệu tổ chức khác.

```ts
// ❌ SAI — ai cũng đọc được board của tổ chức khác
.from('boards').select('*').eq('id', boardId)

// ✅ ĐÚNG
.from('boards').select('*').eq('id', boardId).eq('org_id', orgIdCuaUser)
```

### 2. `user_id` luôn lấy từ TOKEN, không bao giờ từ body

```ts
create(@CurrentUser() user, @Body() body) {
  return this.comments.create(body.cardId, user.uid, body.content);
}                                          //  ↑ đúng
```

Lấy từ body thì ai cũng giả mạo được người khác.

### 3. Mã lỗi HTTP dùng cho đúng

| Tình huống | Trả về |
|---|---|
| Không token / token sai | 401 (guard tự lo) |
| Có đăng nhập nhưng không đủ quyền | **403** |
| Không tìm thấy | **404** |
| Body sai định dạng | **400** (dùng DTO + class-validator) |
| Trùng dữ liệu duy nhất | **409** |

Điểm hay sai nhất: id không tồn tại mà trả **500** thay vì 404.

### 4. Làm xong phải chạy thư mục `5. Kiem tra bao mat` trong Postman

Endpoint trả đúng dữ liệu nhưng không chặn được người lạ thì **vẫn là chưa xong**.

---

## Không bị chặn lẫn nhau

Hoà cần workspace mới tạo được board; Hoàng cần list mới tạo được thẻ. Để khỏi
ngồi chờ nhau, chạy file seed **của mình** trong **Supabase → SQL Editor** —
[`seed-huy.sql`](../postman/seed-huy.sql) / [`seed-hoa.sql`](../postman/seed-hoa.sql) /
[`seed-hoang.sql`](../postman/seed-hoang.sql). Đã điền sẵn email, dán vào là chạy.

File này tạo sẵn 1 tổ chức + 1 workspace + 1 board + 3 cột + vài thẻ + 2 nhãn,
thêm 1 thành viên "Người Lạ" và 1 tổ chức lạ để test bảo mật. Id đã được điền
sẵn trong file environment Postman — không phải copy gì.

Chạy xong, ai làm phần nào cứ thay dần dữ liệu seed bằng endpoint thật của mình.

---

## Bắt đầu

```bash
cd backend
npm install
npm run start:dev
```

Import 2 file vào Postman:
- `backend/postman/web26a-backend.postman_collection.json` (có trong repo)
- `web26a-<tên bạn>.postman_environment.json` (thầy gửi riêng, không có trên git)

Chọn environment mang **tên bạn** ở góc trên bên phải, mở thư mục
**`0. BAT DAU O DAY`** và chạy request đầu tiên. Token tự lưu, các request khác
dùng lại ngay.

Rồi chạy file seed của bạn (`seed-huy.sql` / `seed-hoa.sql` / `seed-hoang.sql`)
trong Supabase → SQL Editor. Đã điền sẵn, không cần sửa gì, cũng không phải copy
id nào về Postman.

Chưa có `backend/.env`? Copy từ `.env.example` rồi **xin thầy giá trị thật** —
file này chứa khoá bí mật nên cố tình không có trên git.

---

## Tính năng tạm hoãn

**AI gợi ý tạo thẻ từ tin nhắn** (`POST /ai/detect-task`) **để làm sau**, không
nằm trong bài của ai.

`AiModule` đã được comment trong `src/app.module.ts`. Đừng bật lại: `AiService`
gọi `getOrThrow('ANTHROPIC_API_KEY')` ngay lúc khởi tạo, nên bật mà thiếu key là
**toàn bộ backend không chạy được** — chứ không phải chỉ hỏng mỗi tính năng AI.

Code trong `src/modules/ai/` vẫn giữ nguyên. Khi nào làm tới, bỏ 2 dòng comment
trong `app.module.ts` và thêm key vào `.env` là xong.

---

## Ghi chú về tên gọi

Dự án từng dùng chữ **`tenant`** cho khái niệm "tổ chức". Toàn bộ đã đổi sang
**`organization`** — module, endpoint, tên biến, tài liệu, Postman đều thống nhất.

Nếu còn thấy chữ `tenant` ở đâu (nhất là bên `frontend/`), đó là chỗ sót — báo
thầy, đừng tự sửa.
