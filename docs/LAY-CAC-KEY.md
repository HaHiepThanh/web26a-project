# Lấy các key cho dự án

Hướng dẫn lấy đủ khoá để chạy được backend. Làm theo thứ tự, chỗ nào đã có rồi
thì bỏ qua.

Mọi khoá nằm ở **MỘT file duy nhất: `secrets/.env`** (ở gốc dự án, không phải
trong `backend/`).

```bash
cp backend/.env.example secrets/.env
```

> Trước đây biến rải ở hai nơi — `backend/.env` (nơi code thật sự đọc) và
> `secrets/.env` (nơi không ai đọc). Điều đó đã gây đúng một lỗi: đặt khoá vào
> `secrets/.env` rồi tưởng cấu hình xong, mà backend không hề thấy. Nay chỉ còn
> một file.

> **Để TRỐNG một dòng nghĩa là "chưa đặt".** Đó là cách đúng để bỏ qua một biến —
> đừng xoá hẳn dòng, để người sau còn biết là có biến đó.

> ⚠️ **`.env` KHÔNG BAO GIỜ được commit.** File đã nằm trong `.gitignore` — đừng
> gỡ ra. Cũng đừng dán khoá vào chat, issue, hay ảnh chụp màn hình.

---

## Bảng tra nhanh

| Khoá | Lấy ở đâu | Bắt buộc? |
|---|---|---|
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard | ✅ Không có thì không chạy |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Firebase Console | ✅ Không có thì không đăng nhập được |
| `GEMINI_API_KEY` | Google AI Studio | ✅ Gợi ý thẻ + kiểm duyệt ảnh (đủ 9 nhóm) |
| `MODERATION_GEMINI_API_KEY` | Google AI Studio (**project khác**) | Khuyến nghị — tách hạn mức tần suất |
| `GOOGLE_VISION_API_KEY` | Google Cloud Console | **Tuỳ chọn** — cần bật thanh toán; bỏ qua được |
| `BREVO_API_KEY` | app.brevo.com | ✅ **Bắt buộc trên máy chủ** — gửi email đặt lại mật khẩu |
| `firebaseApiKey` (frontend) | Firebase Console | ✅ Frontend cần |

---

## 1. Supabase — cơ sở dữ liệu và lưu trữ tệp

1. Vào **https://supabase.com/dashboard** → chọn project của nhóm
2. Bên trái: **Project Settings** (bánh răng) → **API**
3. Chép hai giá trị:

| Trên trang ghi là | Dán vào |
|---|---|
| **Project URL** | `SUPABASE_URL` |
| **service_role** (mục *Project API keys*) | `SUPABASE_SERVICE_ROLE_KEY` |

> ### ⚠️ `service_role` là khoá nguy hiểm nhất trong dự án
>
> Nó **bỏ qua toàn bộ RLS** — ai cầm được nó là đọc và sửa được mọi dữ liệu của
> mọi tổ chức, không cần đăng nhập.
>
> **Chỉ đặt ở backend.** Tuyệt đối không đưa vào code frontend, không dán vào
> Postman công khai, không commit. Frontend dùng khoá `anon` chứ không phải khoá
> này.

---

## 2. Firebase — đăng nhập

### 2a. Service account cho backend (verify ID token)

1. **https://console.firebase.google.com** → chọn project
2. Bánh răng cạnh *Project Overview* → **Project settings**
3. Tab **Service accounts** → **Generate new private key** → **Generate key**
4. File `.json` tự tải về. **Chuyển nó vào thư mục `secrets/`** của dự án
5. Trỏ đường dẫn vào `.env`:

```
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/ten-file-vua-tai.json
```

> `secrets/` đã nằm trong `.gitignore`. File này cho phép giả danh **bất kỳ
> người dùng nào** trong project — giữ như giữ mật khẩu.

Cách thay thế (nếu nơi deploy chỉ cho đặt biến môi trường, không cho đặt file):
khai ba biến `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` +
`FIREBASE_PRIVATE_KEY` lấy từ chính file JSON đó. Code thử
`FIREBASE_SERVICE_ACCOUNT_PATH` trước, không thấy mới rơi sang ba biến này.
Nhớ giữ nguyên các ký tự `\n` trong `FIREBASE_PRIVATE_KEY`.

### 2b. Web API key cho frontend

1. Cùng trang **Project settings** → tab **General**
2. Kéo xuống *Your apps* → chọn app Web → khối **SDK setup and configuration**
3. Chép nguyên khối `firebaseConfig` vào `frontend/src/environments/environment.ts`

Khoá này **công khai được** (nó nằm sẵn trong mã nguồn trang web) — khác hẳn hai
khoá ở mục 1 và 2a.

---

## 3. `GEMINI_API_KEY` — gợi ý thẻ + kiểm duyệt ảnh

Nhanh nhất, không cần thẻ tín dụng.

1. Vào **https://aistudio.google.com/apikey**
2. Đăng nhập bằng tài khoản Google
3. Bấm **Create API key** → **Create API key in new project**
4. Đặt tên project: **`horizon hub harmony`**
5. Chép khoá vào `secrets/.env`:

```
GEMINI_API_KEY=AIza...
```

Khoá này **một mình lo đủ cả 9 nhóm** kiểm duyệt ảnh: khiêu dâm, gợi dục, bạo
lực, máu me, vũ khí, ma tuý, biểu tượng thù ghét, tự hại, gây sốc.

Có khoá này là tính năng chạy đầy đủ — mục 4 bên dưới chỉ để *thêm chính xác*,
không bắt buộc.

### 3b. Khoá Gemini THỨ HAI cho kiểm duyệt (khuyến nghị, vẫn miễn phí)

Kiểm duyệt ảnh và gợi ý tạo thẻ đều gọi Gemini. Dùng **chung một khoá** thì
chúng **ăn chung một hạn mức tần suất** — đã đo được thật trên máy: chạy trọn bộ
kiểm tra một lượt là những lời gọi gợi ý thẻ bắt đầu chạm timeout 30 giây, dù
bản thân chúng không có lỗi gì. Nghỉ vài phút thì lại chạy đúng.

Trong thực tế dùng: vài người cùng tải ảnh lên trong lúc khung chat đang hoạt
động là đủ để **gợi ý tạo thẻ im lặng chết**.

Cách tách (không tốn tiền):

1. Vào **https://aistudio.google.com/apikey**
2. **Create API key** → **Create API key in new project** ← phải là project MỚI
3. Đặt tên project: **`horizon hub harmony vision`**
4. Dán vào `secrets/.env`:

```
MODERATION_GEMINI_API_KEY=AIza...
```

Phải là **project khác** thì hạn mức mới tính riêng; tạo khoá thứ hai trong cùng
project là vẫn chung hạn mức, không giải quyết được gì.

---

## 4. `GOOGLE_VISION_API_KEY` — TUỲ CHỌN, bỏ qua được

> **Không bắt buộc.** Gemini ở mục 3 đã phủ đủ 9 nhóm. Mục này chỉ thêm độ chính
> xác cho ba nhóm cốt lõi (khiêu dâm · gợi dục · bạo lực) và cắt bớt độ trễ —
> đo thật: chỉ Gemini là ~2 giây mỗi lần upload, thêm Vision thì nhanh hơn nhiều.
>
> **Vision đòi gắn thẻ tín dụng vào Google Cloud.** Không gắn được thì bỏ qua cả
> mục này, hệ thống vẫn chạy đủ tính năng.

> **Dùng lại đúng project Google Cloud đã cấu hình cho Google Meet**
> (`horizon-hub-harmony`). Không phải dựng project mới.

> ### 🛑 ĐỌC TRƯỚC KHI DÁN KHOÁ VÀO `.env`
>
> **Cloud Vision BẮT BUỘC bật thanh toán** trên project, kể cả khi bạn chỉ dùng
> trong hạn mức miễn phí (1.000 lượt/tháng). Chưa bật thì mọi lời gọi trả về
> `403 PERMISSION_DENIED — This API method requires billing to be enabled`.
>
> **Hệ quả nếu dán khoá vào khi chưa bật thanh toán: MỌI upload ảnh sẽ bị chặn.**
> Vì đã chọn fail-closed, một nhà cung cấp lỗi ở mọi lời gọi nghĩa là không lần
> nào kiểm xong — và không kiểm xong thì không cho qua. Gemini có chạy tốt cũng
> không cứu được.
>
> Nên thứ tự đúng là: **bật thanh toán → thử khoá → mới dán vào `.env`.**
> Có lệnh thử ở [Bước 0](#bước-0--thử-khoá-trước-khi-dán) bên dưới.

### Bước 0 — Bật thanh toán

1. **https://console.cloud.google.com/billing** → chọn đúng project
2. Liên kết một tài khoản thanh toán (cần thẻ)

Hạn mức miễn phí vẫn áp dụng sau khi bật; một đồ án lớp học gần như chắc chắn
không chạm tới ngưỡng tính tiền. Nhưng đây là **quyết định của bạn** — không
muốn gắn thẻ thì bỏ qua toàn bộ mục 4, hệ thống chạy bằng Gemini vẫn đủ, chỉ
chậm hơn khoảng 2 giây mỗi lần upload.

### Bước 1 — Bật Cloud Vision API

1. Vào **https://console.cloud.google.com**
2. **Chọn đúng project ở thanh trên cùng** — chỗ này rất dễ nhầm, xem cảnh báo
   bên dưới
3. Ô tìm kiếm trên cùng, gõ `Cloud Vision API` → chọn kết quả
4. Bấm **Enable** (đã bật rồi thì nút ghi *Manage*)

### Bước 2 — Tạo API key

1. Menu trái: **APIs & Services** → **Credentials**
2. **+ CREATE CREDENTIALS** → **API key**
3. Hộp thoại hiện khoá → **Copy**

### Bước 3 — Giới hạn khoá (đừng bỏ qua)

Vẫn ở hộp thoại đó, bấm **Edit API key**:

- **API restrictions** → chọn *Restrict key* → tích **Cloud Vision API**
- **Application restrictions** → để **None**

Backend gọi từ server nên không có domain hay IP cố định để chặn theo; giới hạn
theo API là lớp bảo vệ thực tế nhất: khoá bị lộ cũng chỉ dùng được đúng Vision,
không đụng được dịch vụ khác trong project.

Bấm **Save**, rồi dán vào `.env`:

```
GOOGLE_VISION_API_KEY=AIza...
```

### Bước 0' — Thử khoá TRƯỚC khi dán

Chạy lệnh này (thay `<KHOA>` bằng khoá vừa tạo):

```bash
curl -s -X POST "https://vision.googleapis.com/v1/images:annotate?key=<KHOA>" -H 'Content-Type: application/json' -d '{"requests":[{"image":{"source":{"imageUri":"https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png"}},"features":[{"type":"SAFE_SEARCH_DETECTION"}]}]}'
```

| Kết quả | Nghĩa là |
|---|---|
| `safeSearchAnnotation` kèm 5 mức | ✅ Dùng được — dán vào `.env` |
| `403 … requires billing to be enabled` | Chưa bật thanh toán (Bước 0) |
| `403 … API has not been used in project` | Chưa Enable Vision API, hoặc **sai project** |
| `400 API key not valid` | Chép thiếu ký tự |

**Chỉ dán khoá vào `.env` khi lệnh trên trả về `safeSearchAnnotation`.**

### Bước 4 — Kiểm tra

Khởi động lại backend. Trong log phải thấy **cả hai** nhà cung cấp:

```
[ModerationService] Kiểm duyệt ảnh: BẬT (vision-safesearch, gemini-vision)
```

Chỉ thấy `gemini-vision` nghĩa là khoá Vision chưa được đọc — kiểm lại tên biến
trong `.env` và nhớ khởi động lại.

> ### ⚠️ Cái bẫy hay gặp: sai project
>
> Google Cloud Console nhớ project bạn mở lần trước. Rất dễ bật Vision API ở
> **project khác** với project chứa khoá vừa tạo, rồi ngồi tìm mãi không hiểu vì
> sao gọi API trả **403**.
>
> Trước khi bật API và trước khi tạo khoá, **nhìn tên project ở thanh trên cùng
> hai lần**. Cùng một cái bẫy đã ghi ở `docs/CAU-HINH-GOOGLE-MEET.md`.

---

## 5. `BREVO_API_KEY` — gửi email đặt lại mật khẩu

### Vì sao không dùng thẳng Gmail SMTP

Đã thử rồi và đã hỏng trên production. Railway chặn cứng cổng ra 25/465/587 ở
gói Free/Trial/Hobby; chỉ Pro trở lên mới mở. Cùng bộ `SMTP_USER`/`SMTP_PASS`
chạy ngon ở máy bạn rồi chết câm khi lên máy chủ, với log đúng như thế này:

```
ERROR [MailService] Gửi mail thất bại tới <học viên>@gmail.com
Error: Connection timeout            code: 'ETIMEDOUT', command: 'CONN'
Error: connect ENETUNREACH 2404:6800:4003:c02::6c:465
```

`command: 'CONN'` nghĩa là **chưa hề bắt tay được với Gmail** — không phải sai
mật khẩu. Brevo đi bằng HTTPS (cổng 443) nên không dính.

Cấu hình vẫn giữ cả hai đường: có `BREVO_API_KEY` thì dùng Brevo, để trống thì
rơi về `SMTP_*` (tiện cho máy lập trình). Cả hai hỏng thì app tự quay về đường
gửi mail của Firebase.

### Bước 1 — Tạo tài khoản và lấy khoá

1. Vào <https://app.brevo.com> đăng ký (miễn phí, **không cần thẻ**).
2. Góc phải trên → tên tài khoản → **SMTP & API**.
3. Thẻ **API Keys** → **Generate a new API key** → đặt tên `horizon-hub-harmony`.
4. Chép khoá **ngay lúc đó** — đóng hộp thoại là không xem lại được nữa.

### Bước 2 — Xác minh địa chỉ người gửi (đừng bỏ qua)

Brevo không cho gửi từ một địa chỉ chưa xác minh. Không làm bước này thì mọi
lần gửi trả về `400`.

1. **Settings** → **Senders, Domains & Dedicated IPs** → thẻ **Senders**.
2. **Add a sender** → điền tên hiển thị và địa chỉ Gmail của bạn.
3. Mở hộp thư, bấm liên kết xác minh Brevo vừa gửi.

Chỉ cần xác minh **một địa chỉ**, không cần tên miền riêng. Xong là gửi được
cho bất kỳ ai.

### Bước 3 — Dán vào `secrets/.env`

```bash
BREVO_API_KEY=xkeysib-...
MAIL_FROM_EMAIL=địa-chỉ-vừa-xác-minh@gmail.com
MAIL_FROM_NAME=Horizon Hub Harmony
```

Rồi dán **cùng ba biến đó** vào Railway → service backend → **Variables**.

### Bước 4 — Kiểm tra

Khởi động backend và tìm dòng này trong log:

```
[MailService] MailService dùng Brevo HTTPS API (người gửi: ...)
```

Thấy `MailService đã khởi tạo SMTP transporter` thay vào đó nghĩa là
`BREVO_API_KEY` chưa được đọc — kiểm tra xem có để trống hoặc gõ nhầm tên biến
không.

Hạn mức miễn phí là **300 thư/ngày**. Hết hạn mức thì Brevo trả `429`, app hạ
cầu dao và tự quay về đường gửi mail của Firebase trong 5 phút.

---

## 6. Chạy thử

```bash
cd backend && npm run start:dev
```

Log khởi động cần thấy:

```
[ModerationService] Kiểm duyệt ảnh: BẬT (vision-safesearch, gemini-vision)
```

Rồi chạy bộ kiểm tra tự động:

```bash
cd backend && npm run kiem-tra:kiem-duyet-anh
```

---

## Nếu gặp lỗi

| Log / màn hình báo | Nguyên nhân thường gặp |
|---|---|
| `Kiểm duyệt ảnh ĐANG TẮT` | Chưa có khoá nào — kiểm `GEMINI_API_KEY` / `GOOGLE_VISION_API_KEY` |
| `MODERATION_ENABLED=true nhưng KHÔNG có nhà cung cấp nào` | Đặt `true` mà quên khoá. **Mọi ảnh sẽ bị từ chối** (fail-closed) |
| Chỉ thấy `gemini-vision` | Khoá Vision chưa được đọc — sai tên biến, hoặc chưa khởi động lại |
| Upload báo *could not be checked* | Khoá sai, Vision API chưa Enable, hoặc mất mạng |
| Vision trả **403 … requires billing** | Chưa bật thanh toán — xem Bước 0 |
| Vision trả **403 … API has not been used** | Chưa Enable Vision API, hoặc **sai project** |
| Mọi upload đều báo *could not be checked* | Gần như luôn là khoá Vision hỏng: fail-closed chặn hết. Gỡ `GOOGLE_VISION_API_KEY` khỏi `.env` là chạy lại được ngay |
| Backend không khởi động | Thiếu khoá Supabase hoặc sai đường dẫn Firebase service account |

---

## Khi nào phải xoay khoá

Xoay ngay (tạo khoá mới, xoá khoá cũ) nếu khoá đã:

- bị commit lên git, dù đã xoá commit sau đó
- gửi qua chat, email, hoặc hiện trong ảnh chụp màn hình
- **in ra terminal** trong lúc chạy lệnh

> **Việc còn treo:** hai khoá trong `secrets/.env` (Anthropic và Gemini) đã bị
> in ra terminal trong một phiên làm việc trước — **cả hai vẫn cần được xoay.**
> Cùng với đó là OAuth client cũ của Google Meet.

Cách xoay:

| Khoá | Làm gì |
|---|---|
| Gemini | https://aistudio.google.com/apikey → xoá khoá cũ → *Create API key* |
| Vision | Cloud Console → *Credentials* → xoá khoá → tạo lại (nhớ giới hạn API) |
| Supabase `service_role` | Dashboard → *Project Settings* → *API* → **Reset** |
| Firebase service account | Console → *Service accounts* → tạo khoá mới → xoá khoá cũ trong Cloud Console |
| Anthropic | https://console.anthropic.com → *API keys* → xoá → tạo lại |
