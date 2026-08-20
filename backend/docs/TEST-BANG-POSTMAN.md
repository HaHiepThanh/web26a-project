# Test endpoint bằng Postman — từ A đến Z

Dành cho người **chưa từng dùng Postman**. Làm theo đúng thứ tự.

---

## A. Cài đặt lần đầu (làm 1 lần duy nhất)

### A1. Chạy backend

```bash
cd backend
npm install
npm run start:dev
```

Thấy dòng này là được:

```
[NestApplication] Nest application successfully started
```

Kiểm tra nhanh bằng endpoint **không cần đăng nhập**:

```bash
curl http://localhost:3000/health
```

Đúng thì ra `{"status":"ok","supabase":"..."}`.
Không ra gì → server chưa chạy hoặc cổng 3000 đang bị chương trình khác chiếm.

> Chưa có file `.env`? Copy `backend/.env.example` thành `backend/.env` rồi **xin
> thầy giá trị thật**. Không đoán, không lấy trên mạng — file này chứa khoá bí mật
> nên cố tình không có trên git.

### A2. Import vào Postman

Mở Postman → **Import** → kéo vào **2 file**:

| File | Lấy ở đâu |
|---|---|
| `backend/postman/web26a-backend.postman_collection.json` | có trong repo |
| `web26a-<tên bạn>.postman_environment.json` | **thầy gửi riêng cho từng người** — chứa Firebase API key, không có trên git |

Sau khi import, ở góc **trên bên phải** Postman có ô chọn environment — chọn
đúng cái mang **tên bạn** (`web26a - Huy` / `web26a - Hoà` / `web26a - Hoàng`).
Bước này hay bị quên, quên là mọi biến `{{...}}` thành rỗng.

> **Vì sao mỗi người một file?** File đó chứa `testEmail` — tài khoản đăng nhập
> **giả** mà Postman dùng để lấy token. Không phải email thật của bạn, `@test.dev`
> cũng không phải domain có thật. Ba bạn cần ba tài khoản khác nhau để dữ liệu
> test của mỗi người nằm riêng, không đè lên nhau. Thầy đã điền sẵn — **đừng đổi**.

### A3. Tạo dữ liệu mẫu

Để không phải ngồi chờ bạn khác làm xong endpoint tạo dữ liệu:

1. Mở Supabase → **SQL Editor** → **New query**
2. Dán nội dung file seed **của bạn** — không cần sửa gì cả:

   | Bạn | File |
   |---|---|
   | Huy | `backend/postman/seed-huy.sql` |
   | Hoà | `backend/postman/seed-hoa.sql` |
   | Hoàng | `backend/postman/seed-hoang.sql` |

3. Bấm **Run**

> ⚠️ Phải chạy `GET /auth/me` (bước B ở dưới) **ít nhất 1 lần trước đã** — lúc đó
> backend mới tạo dòng của bạn trong bảng `users`. Chưa làm thì file seed dừng
> lại kèm hướng dẫn, không phải lỗi gì nghiêm trọng.

Xong sẽ có sẵn 1 tổ chức + 1 workspace + 1 board + 3 cột + 3 thẻ + 2 nhãn, cộng
thêm 1 "Người Lạ" và 1 tổ chức lạ để test bảo mật.

**Không phải copy id gì cả.** Mọi id đều được tính ra từ email của bạn chứ không
random, nên thầy đã điền sẵn vào file environment Postman. Chạy seed xong là bấm
Send được ngay.

Cuối kết quả có in ra một bảng id — đó chỉ để **xem cho biết**, dùng khi nghi ngờ
Postman đang trỏ sai chỗ. Không cần dán đi đâu.

Chạy lại lúc nào cũng được: nó xoá dữ liệu seed cũ **của riêng bạn** rồi tạo lại,
và tạo lại đúng những id cũ. Lỡ xoá nhầm mất dữ liệu thì chạy lại file này là có
lại sau 10 giây, Postman vẫn trỏ đúng.

---

## B. Lấy token (làm lại mỗi khi test — token chỉ sống 1 tiếng)

Mọi endpoint trừ `/health` đều đòi **Firebase ID token**. Không có là **401**,
chuyện này không liên quan gì tới code bạn viết.

### B0. Đặt email test của riêng bạn — làm 1 lần

⚠️ **Ba bạn phải dùng 3 email khác nhau.** Dùng chung một email là chung một tài
khoản, chung một tổ chức seed → người chạy seed sau ghi đè lên dữ liệu người trước.

File environment ship sẵn `hocvien-a@test.dev`. Đổi thành tên bạn:

```
Postman → Environments → web26a - Local → sửa ô testEmail → Save
```

```
Huy    →  huy@test.dev
Hoà    →  hoa@test.dev
Hoàng  →  hoang@test.dev
```

Email này là **giả**, `.test.dev` không phải domain thật — Firebase không gửi mail
xác minh, nó chỉ dùng làm định danh tài khoản test. Mật khẩu giữ nguyên.

> **Phải khác nhau ở phần TRƯỚC dấu @, không phải ở domain.** File seed đặt tên
> tổ chức theo phần trước @, nên `huy@gmail.com` và `huy@test.dev` bị coi là cùng
> một người. (Seed có kiểm tra và sẽ chặn kèm hướng dẫn, không làm mất dữ liệu ai —
> nhưng đặt đúng ngay từ đầu thì đỡ mất một vòng.)

### B1. Đăng ký tài khoản test — chỉ lần đầu

Thư mục **`0. BAT DAU O DAY`** → request **`Dang ky tai khoan test`** → **Send**.

Chạy lần thứ hai sẽ báo `EMAIL_EXISTS` — **bình thường**, tài khoản đã có rồi,
bỏ qua và sang B2.

> Mỗi lần đổi `testEmail` là phải chạy lại request này, nếu không `Dang nhap`
> sẽ báo `EMAIL_NOT_FOUND` (tài khoản mới chưa tồn tại).

### B2. Đăng nhập

Cùng thư mục → request **`Dang nhap (lay token)`** → **Send**.

Token **tự lưu** vào biến `{{idToken}}`, mọi request khác dùng lại ngay.
Không phải copy dán gì cả.

### B3. Xem uid của mình

Mở tab **Console** ở góc dưới bên trái Postman, sẽ thấy:

```
Da luu token. UID = AbC123xyzXXXXXXXXXXXXXXXX
```

Đó là Firebase uid — cũng chính là `users.id` trong database. Dùng cho file seed
ở bước A3.

### B4. Khi token hết hạn

**Dấu hiệu:** đang test ngon lành, đột nhiên **mọi** request trả 401.

**Cách xử lý:** chạy lại `Dang nhap (lay token)`. Hoặc dùng request
`Lam moi token (khi het han)` — nhanh hơn, không cần nhập lại mật khẩu.

> Đây là thứ gây hoang mang nhất với người mới. Thấy 401 hàng loạt thì **đừng
> vội sửa code** — lấy token mới trước đã.

---

## C. Gọi endpoint của mình

### C1. Tìm đúng thư mục

| Bạn là | Mở thư mục |
|---|---|
| Huy | `2. HUY — To chuc & Workspace` |
| Hoà | `3. HOA — Board, List, Label` |
| Hoàng | `4. HOANG — Card, Comment, Chat, Activity` |

Thư mục `1. Auth — DA XONG` là phần đã làm sẵn — chạy thử để **thấy một endpoint
hoạt động đúng trông như thế nào**, đừng sửa.

### C2. Ba tab cần biết trong 1 request

| Tab | Nội dung | Ai điền |
|---|---|---|
| **Headers** | `Authorization: Bearer {{idToken}}` và `Content-Type: application/json` | đã điền sẵn |
| **Body** | dữ liệu gửi lên, chọn kiểu **raw → JSON** | đã có mẫu, sửa lại theo ý bạn |
| **Params** | phần sau dấu `?` trong URL, vd `boardId` | đã điền sẵn bằng biến |

GET và DELETE **không dùng Body** — dữ liệu đi qua đường dẫn hoặc query params.

### C3. Biến `{{...}}` là gì

Các uuid dài ngoằng được cất trong biến để khỏi phải dán tay:

```
{{baseUrl}}      http://localhost:3000
{{idToken}}      token đăng nhập
{{orgId}}        id tổ chức
{{workspaceId}}  id workspace
{{boardId}}      id board
{{listId}}       id cột
{{cardId}}       id thẻ
{{labelId}}      id nhãn

{{memberUserId}} uid của "Người Lạ" — thành viên thường trong tổ chức của bạn
{{orgIdNguoiLa}} id một tổ chức bạn KHÔNG thuộc về
```

Hai biến cuối do file seed tạo ra, dùng riêng cho việc **tự test** mà không cần
rủ bạn khác: `{{memberUserId}}` để thử mời / đổi vai trò / xoá thành viên,
`{{orgIdNguoiLa}}` để thử truy cập dữ liệu tổ chức khác (phải bị chặn).

Nhiều request **tự lưu** id vào biến sau khi chạy thành công. Ví dụ chạy
`POST /boards` xong thì `{{boardId}}` tự có giá trị, request `GET /boards/:id`
dùng được luôn.

Ban đầu chúng đã có sẵn giá trị trỏ vào **dữ liệu seed**. Khi bạn tự tạo board
mới bằng `POST /boards`, script sẽ **ghi đè** `{{boardId}}` sang board vừa tạo —
các request phía dưới tự động chuyển sang làm việc trên board mới.

👉 Vì vậy: **chạy các request theo thứ tự trên xuống dưới**.

Xem giá trị hiện tại của biến: bấm icon 👁 góc trên bên phải.

### C4. Bấm Send

---

## D. Đọc kết quả

### D1. Nhìn 3 chỗ

1. **Status code** — góc trên bên phải khung kết quả
2. **Body** — dữ liệu trả về
3. **Supabase → Table Editor** — dữ liệu đã thật sự vào bảng chưa

Chỗ thứ 3 hay bị bỏ qua nhất. Hàm service còn `return null` thì endpoint vẫn trả
**200 + `null`** rất "sạch sẽ", nhìn qua tưởng chạy được.

### D2. Status code nào là đúng

| Việc | Đúng phải là |
|---|---|
| `POST` tạo mới | **201** |
| `GET`, `PATCH`, `DELETE` | **200** |

### D3. Khi kết quả không như mong đợi

| Thấy gì | Nguyên nhân gần như chắc chắn | Sửa |
|---|---|---|
| `401` | Token thiếu / sai / hết hạn | Chạy lại `Dang nhap` |
| `404` mà đường dẫn nhìn đúng | Biến `{{...}}` đang rỗng → URL thiếu 1 đoạn | Bấm 👁 xem biến, chạy request tạo trước |
| `400` | DTO chặn body sai định dạng | Đọc mảng `message` trong kết quả, nó chỉ rõ field nào |
| `500` | Lỗi trong code | **Xem terminal đang chạy `start:dev`** — stack trace đầy đủ ở đó |
| `200` + `null` hoặc `[]` | Hàm service vẫn là stub, chưa viết code | Viết code 🙂 |
| `null` dù đã viết code | Thiếu `.select()` sau `.insert()`, hoặc quên `await` | Thêm vào |
| `[]` dù Supabase có dữ liệu | Lọc sai id, hoặc query param không truyền | So id trong query với id trong bảng |
| `409` | Trùng giá trị UNIQUE (slug, cặp card+label) | Đổi giá trị, hoặc bắt lỗi `23505` trả 409 |

> **Quy tắc vàng khi gặp 500:** đừng đoán trong Postman. Mở terminal đang chạy
> `npm run start:dev`, dòng đỏ ở đó nói chính xác file nào dòng nào.

---

## E. Kiểm tra bảo mật — bắt buộc trước khi báo xong

Thư mục **`5. Kiem tra bao mat`** có sẵn 3 request:

| Request | Phải ra |
|---|---|
| `Khong co token → phai 401` | 401 |
| `Token bia dat → phai 401` | 401 |
| `Health check (khong can token)` | 200 |

và 2 request dùng `{{orgIdNguoiLa}}` — tổ chức do file seed tạo ra mà **bạn
không thuộc về**. Gọi endpoint với id đó phải ra **403 hoặc 404**. Trả về dữ liệu
thật là **lỗi nặng nhất** của dự án này.

Thêm 2 phép thử **tự làm** trên chính endpoint của bạn:

1. **Sửa uuid thành id không tồn tại** (đổi 1 chữ số) → phải **404**, không phải 500
2. **Xoá 1 field bắt buộc trong body** → phải **400**, không phải 500

Backend dùng `service_role key` nên database **không tự bảo vệ** — chỉ có code của
bạn đứng chắn.

---

## F. Test bằng curl (khi không muốn mở Postman)

Lấy token:

```bash
TOKEN=$(curl -s -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<FIREBASE_API_KEY>" \
  -H 'Content-Type: application/json' \
  -d '{"email":"hocvien-a@test.dev","password":"Passw0rd!","returnSecureToken":true}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["idToken"])')
```

Gọi endpoint:

```bash
curl -s http://localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"
```

Gửi kèm body:

```bash
curl -s -X POST http://localhost:3000/workspaces \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"orgId":"5eed0000-0000-4000-8000-000000000001","name":"Test"}'
```

Xem cả status code:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/auth/me
```

`<FIREBASE_API_KEY>` nằm trong file environment thầy gửi riêng.
