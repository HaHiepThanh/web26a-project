# Phân công backend — Huy, Hoà, Hoàng

> Chỉ cần chạy được bằng **Postman**. Chưa phải tích hợp vào frontend.

Phần `auth` (3 endpoint) **đã làm xong** — dùng làm mẫu tham khảo, đừng sửa.

---

## 📌 Bắt đầu ở đâu

**Mỗi bạn chỉ cần đọc 1 file của mình:**

| Bạn | File | Mảng | Số endpoint |
|---|---|---|---|
| **Huy** | 👉 [`HUY.md`](HUY.md) | Tổ chức & Workspace + phân quyền | 12 + `RolesGuard` |
| **Hoà** | 👉 [`HOA.md`](HOA.md) | Board, List, Label | 14 |
| **Hoàng** | 👉 [`HOANG.md`](HOANG.md) | Card, Comment, Chat, Activity | 10 + 2 bonus |

**Kèm AI Agent:** mở [`PROMPT.md`](PROMPT.md), copy prompt mở đầu, thay `<TÊN>`
bằng tên mình rồi dán vào AI Agent. Agent sẽ tự biết bạn làm endpoint nào, nên bắt
đầu từ đâu, và hướng dẫn test từng cái.

---

## Cách chia việc

|  | Huy | Hoà | Hoàng |
|---|---|---|---|
| **Mảng** | Tổ chức & Workspace | Board, List, Label | Card, Comment, Chat, Activity |
| **Endpoint** | 12 | 14 | 10 (+2 bonus) |
| **Thư mục** | `organizations/`, `workspaces/`, `common/firebase/roles.guard.ts` | `boards/`, `lists/`, `labels/` | `cards/`, `comments/`, `chat/`, `activity/`, `ai/` |
| **Việc khó nhất** | Phân quyền owner/admin/member | Sắp xếp lại thứ tự cột | Kéo thẻ sang cột khác |

**Vì sao chia thế này:**

- **Huy** nhận phần nặng nhất. Không phải vì nhiều endpoint mà vì `RolesGuard` là
  lớp bảo mật cốt lõi — viết sai là thủng cả hệ thống, không riêng phần của Huy.
  Thêm nữa, cả nhóm chờ Huy: có workspace mới có board, có board mới có thẻ.
- **Hoà** nhiều endpoint nhất nhưng phần lớn là CRUD lặp cùng một khuôn. Làm xong
  board thì list và label chỉ là chép lại đổi tên bảng.
- **Hoàng** ít endpoint nhất và phần lớn là leaf feature — không ai chờ Hoàng cả,
  nên có sai cũng không chặn tiến độ nhóm. Tài liệu của Hoàng cũng chi tiết nhất,
  gần như có sẵn code để đọc hiểu rồi tự gõ lại.

---

## Tài liệu chung — ai cũng nên đọc

| File | Khi nào đọc |
|---|---|
| [`CACH-LAM-1-ENDPOINT.md`](CACH-LAM-1-ENDPOINT.md) | **Đọc trước tiên.** Công thức 6 bước làm 1 endpoint, dùng cho cả 36 cái. |
| [`TEST-BANG-POSTMAN.md`](TEST-BANG-POSTMAN.md) | Khi cần lấy token / test / gặp lỗi lạ |
| [`TRA-CUU-DATABASE.md`](TRA-CUU-DATABASE.md) | Khi cần biết tên bảng, tên cột, giá trị hợp lệ |
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
ngồi chờ nhau, chạy [`../postman/seed-du-lieu-test.sql`](../postman/seed-du-lieu-test.sql)
trong **Supabase → SQL Editor**. File này tạo sẵn 1 tổ chức + 1 workspace + 1 board
+ 3 cột + vài thẻ + 2 nhãn, và in ra id để dán vào Postman.

Chạy xong, ai làm phần nào cứ thay dần dữ liệu seed bằng endpoint thật của mình.

---

## Bắt đầu

```bash
cd backend
npm install
npm run start:dev
```

Import 2 file trong `backend/postman/` vào Postman (file environment thầy gửi
riêng, không có trên git), chọn environment **web26a - Local**, mở thư mục
**`0. BAT DAU O DAY`** và chạy request đầu tiên. Token tự lưu, các request khác
dùng lại ngay.

Chưa có `backend/.env`? Copy từ `.env.example` rồi **xin thầy giá trị thật** —
file này chứa khoá bí mật nên cố tình không có trên git.

---

## Ghi chú về tên gọi

Dự án từng dùng chữ **`tenant`** cho khái niệm "tổ chức". Toàn bộ đã đổi sang
**`organization`** — module, endpoint, tên biến, tài liệu, Postman đều thống nhất.

Nếu còn thấy chữ `tenant` ở đâu (nhất là bên `frontend/`), đó là chỗ sót — báo
thầy, đừng tự sửa.
