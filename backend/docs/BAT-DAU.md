# BẮT ĐẦU Ở ĐÂY

> Đọc hết trang này một lượt trước khi gõ lệnh đầu tiên. Khoảng 5 phút.

## Đợt này làm gì, không làm gì

**Chỉ làm backend.** Vòng làm việc của bạn gói gọn trong 3 thứ:

```
   viết code trong backend/src/
            ↓
   gọi thử bằng POSTMAN          ← xem API trả về đúng chưa
            ↓
   mở SUPABASE → Table Editor    ← xem dữ liệu đã thật sự vào bảng chưa
```

🚫 **Không cần chạy frontend.** Đừng `cd frontend`, đừng `ng serve`, đừng
`npm install` trong đó. Thư mục `frontend/` đợt này **không phải việc của ai cả**.

> Chạy thử cũng không lên được đâu: `frontend/src/environments/environment.ts`
> chứa khoá cấu hình nên bị `.gitignore` chặn, `git pull` về sẽ không có file đó
> và Angular báo lỗi thiếu file. Đó **không phải** lỗi của bạn — chỉ là frontend
> chưa tới lượt.

Ngoại lệ duy nhất: **Huy cần MỞ ĐỌC** `frontend/src/app/utils/slug.util.ts` để
copy danh sách `RESERVED_SLUGS` sang backend. Chỉ đọc file, không chạy gì.

---

## 1. Lấy code về

```bash
git fetch origin
```

⚠️ Dùng `fetch`, **không** phải `git pull origin main` — `pull` chỉ tải nhánh
`main`, không tải nhánh của bạn về, và bước 2 sẽ báo
`error: pathspec ... did not match any file(s) known to git`.

## 2. Sang nhánh của mình — chỉ làm việc trên nhánh này

| Bạn | Lệnh |
|---|---|
| **Huy** | `git checkout feat/huy-organizations` |
| **Hoà** | `git checkout feat/hoa-boards` |
| **Hoàng** | `git checkout feat/hoang-cards` |

Kiểm tra đang đứng đúng chỗ:

```bash
git branch --show-current
```

## 3. Đọc phần việc của mình

Mở [`PHAN-CONG-BACKEND.md`](PHAN-CONG-BACKEND.md) → bấm vào file tên mình
([`HUY.md`](HUY.md) / [`HOA.md`](HOA.md) / [`HOANG.md`](HOANG.md)), đọc hết một lượt.

## 4. Cài và chạy backend

```bash
cd backend
npm install
npm run start:dev
```

Chưa chạy được vì thiếu `.env` — anh gửi cho **Huy**, hai bạn còn lại xin lại của
Huy. File `.env` này **cả 3 bạn dùng chung y hệt nhau**.

Đặt nó trong thư mục `backend/`, ngang hàng với `package.json`.

## 5. Cài Postman và import 2 file

| File | Lấy ở đâu |
|---|---|
| `backend/postman/web26a-backend.postman_collection.json` | có sẵn trong repo |
| `web26a-<tên bạn>.postman_environment.json` | **anh gửi riêng từng người** |

> 🚨 **File thứ hai MỖI BẠN MỘT FILE KHÁC NHAU — không xin của nhau được.**
> Trong đó có tài khoản test riêng của bạn và toàn bộ id dữ liệu mẫu của riêng bạn.
> Dùng nhầm file của người khác là bước 8 sẽ báo lỗi và dữ liệu 3 bạn đè lên nhau.

Import xong, chọn environment **mang tên mình** ở góc trên bên phải:
`web26a - Huy` / `web26a - Hoà` / `web26a - Hoàng`.

Bỏ qua bước chọn này là mọi biến `{{...}}` thành rỗng → không test được gì.

## 6. Lấy token

Thư mục **`0. BAT DAU O DAY`** → chạy `Dang ky tai khoan test`, rồi
`Dang nhap (lay token)`.

Token **tự lưu**, không phải copy dán.

## 7. Gọi `GET /auth/me` một lần

Thư mục **`1. Auth`** → chạy `GET /auth/me`.

Bước này tạo dòng của bạn trong bảng `users`. **Bắt buộc có trước bước 8**, nếu
không file seed sẽ dừng lại.

## 8. Tạo dữ liệu mẫu

Supabase → **SQL Editor** → **New query** → dán nguyên file seed của mình →
**Run**. Không cần sửa gì cả.

| Bạn | File |
|---|---|
| Huy | `backend/postman/seed-huy.sql` |
| Hoà | `backend/postman/seed-hoa.sql` |
| Hoàng | `backend/postman/seed-hoang.sql` |

Chạy xong là dùng Postman được ngay. Cuối kết quả có in ra một bảng id — đó chỉ
để **xem cho biết**, **không phải copy đi đâu cả**. Anh đã điền sẵn hết trong
file environment của bạn rồi.

## 9. Bắt đầu làm

Mở [`PROMPT.md`](PROMPT.md), copy prompt mở đầu, thay `<TÊN>` bằng tên mình, dán
vào AI Agent.

---

## Ba điều nhớ giùm anh

**1. Token đăng nhập chỉ sống 1 tiếng.**
Đang chạy ngon mà đột nhiên **mọi** request thành 401 thì là token hết hạn —
đừng sửa code, chạy lại `Dang nhap` trước đã.

**2. Hàm chưa viết vẫn trả `200` + `null`, nhìn tưởng chạy được.**
Luôn mở Supabase → Table Editor xem dữ liệu đã thật sự vào bảng chưa.

**3. Lỗi 500 thì XEM TERMINAL đang chạy `start:dev`, không phải xem Postman.**
Stack trace đầy đủ chỉ có ở terminal, Postman chỉ hiện một dòng chung chung.

---

## Luật chung

- Chỉ sửa file trong **thư mục của mình**.
- Đừng đụng `modules/auth/` — đã làm xong, để làm mẫu tham khảo.
- Đừng đụng phần của 2 bạn kia.
- Mất dữ liệu thì đừng hoảng — chạy lại file seed ở bước 8 là có lại hết sau 10 giây.
- Ai cài thêm thư viện npm thì **báo nhóm**, vì `package.json` là file dùng chung.

---

## Kẹt thì làm gì

1. Xem terminal đang chạy `npm run start:dev`
2. Mở `src/modules/auth/auth.service.ts` — code mẫu chuẩn nhất trong dự án
3. Hỏi AI Agent, kèm đủ **3 thứ**: code bạn viết + kết quả Postman + dòng lỗi ở
   terminal. Thiếu cái thứ ba thì ai cũng chỉ đoán mò được thôi.
   Các mẫu câu hỏi có sẵn trong [`PROMPT.md`](PROMPT.md).
