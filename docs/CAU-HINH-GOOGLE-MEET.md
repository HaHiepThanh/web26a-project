# Cấu hình Google Cloud cho tính năng "Mở cuộc họp" (Google Meet)

> **Trạng thái: code đã xong và đã test. File này là phần CÒN LẠI — những bước
> chỉ chủ tài khoản Google mới làm được.**
>
> Ngày viết: 2026-08-26.

Làm xong 3 bước trong file này thì nút **"Start meeting"** trên trang Board hoạt
động. Chưa làm thì bấm vào Google sẽ từ chối.

> Giao diện app dùng **tiếng Anh**, nên các thông báo lỗi trích trong file này
> cũng là nguyên văn tiếng Anh — tra cho khớp với thứ bạn nhìn thấy trên màn hình.

---

## 0. Trước khi bắt đầu — cái bẫy đã sập một lần

Google Cloud có thể có **nhiều project cùng tên na ná nhau**. Toàn bộ cấu hình
dưới đây phải nằm trên **đúng project mà Firebase đang chạy**, nếu không thì
bật gì cũng vô ích: token do Firebase cấp thuộc project của Firebase, không
liên quan tới project khác.

**Project đúng:**

| | Giá trị |
|---|---|
| Project ID | `horizon-hub-harmony` |
| Project number | `281183003536` |

**Cách tự kiểm chứng:** mở `frontend/src/environments/environment.ts`, xem dòng
`appId`:

```
appId: '1:281183003536:web:bc2f194277ad59990a0915'
        └──────┬─────┘
         project number
```

Số ở giữa hai dấu `:` đầu tiên **chính là** project number của Firebase. Mọi
trang trong Google Cloud Console phải đứng ở project mang số này.

> ⚠️ **Đã từng sai ở đây.** Lần đầu cấu hình, bộ chọn project ở đầu trang đang
> đứng ở project khác, nên trang cấu hình tưởng là chưa có gì và mời "tạo mới"
> → sinh ra project thừa `horizon-hub-harmony-506715` (number `204464008052`).
> Cấu hình trên project đó **không có tác dụng gì**.
>
> Mọi link trong file này đều gắn sẵn `?project=horizon-hub-harmony` để bộ chọn
> tự nhảy đúng chỗ. **Dùng link, đừng bấm thủ công qua menu.**

### Không cần tạo OAuth client, không cần tải `client_secret`

Tính năng này dùng `linkWithPopup` của Firebase, tức **dùng lại OAuth client mà
Firebase đã tự tạo** khi bật đăng nhập Google từ đầu. Không có bước nào đổi
authorization-code phía server, nên **không có chỗ nào dùng tới
`client_secret`**.

Nếu đã lỡ tạo "Web application" OAuth client và tải file `client_secret...json`
về máy:

1. Xoá OAuth client đó trong Console — thao tác này vô hiệu hoá secret ngay
2. Xoá file JSON dưới máy (thường ở `~/Downloads`)
3. Xoá luôn project thừa nếu nó không chứa gì khác

Không cần lo file đó lọt vào repo: `secrets/` đã được `.gitignore` chặn, và đã
kiểm tra không có chuỗi nào của nó trong mã nguồn.

---

## 1. Bật Google Calendar API

```
https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=horizon-hub-harmony
```

Bấm **Enable**. Đã bật rồi thì nút đổi thành **Manage** — thế là xong bước này.

<details>
<summary>Vì sao là Calendar API chứ không phải Google Meet API?</summary>

Yêu cầu là cuộc họp phải **mang tên board**. Meet API (`spaces.create`) tạo được
phòng nhưng **không đặt được tên** — tài nguyên Space không có trường tiêu đề.

Calendar API thì có: ta tạo một sự kiện lịch với `summary` = tên board, kèm
`conferenceData.createRequest`, và Google trả về link Meet gắn với sự kiện đó.
Tên sự kiện chính là tên hiện trong Meet.

Đây là lý do file này nói tới "Calendar" trong khi tính năng tên là "Meet".
</details>

---

## 2. Google Auth Platform — thêm Test users

> Google đã **đổi giao diện**: phần này trước nằm trong "OAuth consent screen",
> nay tách thành mục riêng tên **Google Auth Platform** với các trang con
> Branding / Audience / Data Access. Hướng dẫn cũ trên mạng phần lớn đã lỗi thời.

```
https://console.cloud.google.com/auth/audience?project=horizon-hub-harmony
```

### Trường hợp A — trang ghi **External**

Đây là trường hợp thường gặp. Kéo xuống mục **Test users** → bấm **Add users** →
nhập **mọi địa chỉ Gmail sẽ dùng để demo** → **Save**.

> 🔴 **Đây là cửa chặn cứng nhất của toàn bộ tính năng.** Ở chế độ Testing,
> tài khoản KHÔNG có trong danh sách này sẽ bị Google từ chối thẳng khi bấm nút.
> Thiếu một tài khoản là đúng lúc demo tài khoản đó hỏng.
>
> Thêm **dư** còn hơn thiếu. Giới hạn là 100 người.

### Trường hợp B — trang ghi **Internal**

Không cần làm gì. Mọi tài khoản trong tổ chức Google Workspace đều dùng được
ngay, không có danh sách test users.

### Nếu trang báo chưa cấu hình

Vào **Branding** trước, điền tên app + email hỗ trợ + email liên hệ, đồng ý điều
khoản:

```
https://console.cloud.google.com/auth/branding?project=horizon-hub-harmony
```

Xong quay lại trang Audience.

---

## 3. Data Access — khai scope

```
https://console.cloud.google.com/auth/scopes?project=horizon-hub-harmony
```

Bấm **Add or remove scopes**, tìm và tick:

```
https://www.googleapis.com/auth/calendar.events
```

Rồi **Update** → **Save**.

<details>
<summary>Vì sao xin scope hẹp này chứ không phải <code>.../auth/calendar</code>?</summary>

`.../auth/calendar` cho đọc-ghi **toàn bộ** lịch của người dùng. Ta chỉ cần tạo
một sự kiện, nên xin `calendar.events` là đủ.

Xin rộng hơn mức cần vừa bắt người dùng đánh đổi nhiều hơn, vừa làm màn hình
đồng ý của Google trông đáng ngại hơn — và nếu sau này nộp thẩm định thì scope
càng rộng càng khó qua.
</details>

> **Bước này ít gắt hơn bước 2.** Ở chế độ Testing, cửa chặn thật sự là danh
> sách test users. Khai scope là bắt buộc khi nộp thẩm định và nên làm cho khớp,
> nhưng nếu trang này khó thao tác thì cứ làm bước 2 rồi thử luôn — nhiều khả
> năng đã chạy được.

---

## 4. Kiểm tra

Cần **hai trình duyệt** (hoặc một cửa sổ thường + một cửa sổ ẩn danh), đăng nhập
hai tài khoản khác nhau, cùng một tổ chức.

| # | Việc làm | Kết quả đúng |
|---|---|---|
| 0 | Vào **Settings → Profile**, mục *Google account* | Bấm **Link Google account**, chọn ĐÚNG tài khoản trùng email đăng nhập |
| 1 | **Owner** mở một board | Thấy nút **"Start meeting"**. Chưa liên kết thì nút **bị khoá** + badge `Google required` |
| 2 | Owner bấm nút | Popup Google hiện ra, xin quyền Lịch |
| 3 | Owner đồng ý | Nút đổi thành **"Join meeting"** màu xanh |
| 4 | **Thành viên** nhìn màn hình (không F5) | Nút "Join meeting" **tự hiện** — nhờ realtime |
| 5 | Cả hai bấm "Join meeting" | Cùng vào **một** phòng Meet, tên phòng = tên board |
| 6 | Owner bấm dấu **✕** cạnh nút | Cuộc họp bị gỡ ở cả hai màn hình, **không cần F5** |

> Ở bước 0, nếu chọn nhầm tài khoản Google khác email đăng nhập thì app **tự gỡ
> liên kết** và báo lỗi — cuộc họp phải nằm trong lịch của đúng người đó.

Điểm 4 và 5 là phần đáng xem nhất: nó chứng minh cả nhóm vào **cùng** một phòng
chứ không phải mỗi người một phòng riêng.

---

## 5. Gặp lỗi thì tra ở đây

| Thông báo / hiện tượng | Nguyên nhân | Cách sửa |
|---|---|---|
| *"Google denied calendar access. Check that the Calendar API is enabled and this account is in the OAuth test users list."* | Tài khoản chưa có trong Test users, **hoặc** cấu hình nằm nhầm project | Làm lại bước 2. Kiểm project number đúng `281183003536` |
| Màn hình Google ghi *"Access blocked"* / *"has not completed verification"* | Y như trên — tài khoản ngoài danh sách test users | Thêm tài khoản đó vào Test users |
| *"Your browser blocked the Google window."* | Popup bị chặn | Cho phép popup cho trang này rồi bấm lại |
| *"That Google account is already linked to a different user here."* | Email Google đó đã liên kết với một tài khoản khác trong app | Dùng Gmail khác, hoặc gỡ liên kết ở tài khoản kia |
| *"Google created the event but returned no Meet link."* | Sự kiện tạo được nhưng thiếu phần hội nghị | Thử lại. Nếu lặp lại: kiểm tài khoản có bị chính sách Workspace chặn Meet không |
| *"You signed in as X but picked the Google account Y."* | Chọn nhầm tài khoản Google trong popup | App đã tự gỡ liên kết. Bấm lại và chọn đúng tài khoản trùng email đăng nhập |
| Bấm nút không thấy gì, không lỗi | Người dùng tự đóng popup — **cố ý không báo lỗi** | Bấm lại và hoàn tất popup |
| Nút **"Start meeting"** bị mờ, không bấm được | Chưa liên kết Google | Vào **Settings → Profile → Google account** liên kết trước |
| Không thấy nút đâu cả | Chỉ owner/admin tổ chức mới thấy nút **mở** họp. Thành viên thường chỉ thấy nút **vào** họp sau khi đã có phòng | Đúng thiết kế, không phải lỗi |

---

## 6. Vài điều nên biết

**Mỗi lần mở cuộc họp sẽ có một popup Google.** Đây là chủ ý, không phải thiếu
sót. Firebase chỉ cấp access token sống khoảng một giờ và **không** cấp refresh
token. Muốn khỏi popup thì phải chạy luồng OAuth riêng phía server và **cất giữ
refresh token** của tài khoản Google người dùng — một bí mật dài hạn mở được
lịch của họ, đòi mã hoá khi nghỉ, xoay vòng khoá, đường thu hồi, và một lần rò
là rò tài khoản Google thật. Đổi lấy việc bớt một cú popup — không đáng.

Hệ quả tốt: **server của dự án không bao giờ thấy token Google nào.** Cuộc họp
được tạo ngay trong trình duyệt chủ board; server chỉ nhận đúng một chuỗi URL đã
tạo xong.

**Người vào họp không cần liên kết Google.** Chỉ người **mở** cuộc họp mới cần.
Những người còn lại chỉ mở một link đã lưu sẵn.

**Sự kiện lịch nằm trong lịch riêng của người mở.** Gỡ cuộc họp khỏi board
(nút ✕) **không** xoá sự kiện bên Google — app không đụng vào lịch cá nhân sau
khi đã tạo. Muốn xoá thì tự xoá trong Google Calendar.

**Muốn hết màn hình cảnh báo "chưa được xác minh"** thì phải nộp Google thẩm
định — mất vài tuần. Với phạm vi lớp học/demo thì chế độ Testing + test users là
đủ, không cần thẩm định.

---

## Phụ lục — phần code liên quan

| Việc | Ở đâu |
|---|---|
| Ô liên kết Google | `frontend/src/app/components/settings/profile-tab/profile-tab.html` |
| Gọi Google, xử lý popup và lỗi | `frontend/src/app/services/google-meet.service.ts` |
| Test cho phần trên (15 bài) | `frontend/src/app/services/google-meet.service.spec.ts` |
| Nút trên thanh board | `frontend/src/app/components/board/board-header-bar/board-header-bar.html` |
| Nối nút với luồng tạo họp | `frontend/src/app/pages/board/board.ts` (`startMeet` / `endMeet`) |
| Lưu link, chặn link độc hại | `backend/src/modules/boards/dto/update-board.dto.ts` |
| Cột database | `backend/migrations/0008_lien_ket_google_meet.sql` (đã chạy) |
