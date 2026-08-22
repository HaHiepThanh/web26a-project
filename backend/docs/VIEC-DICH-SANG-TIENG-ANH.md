# HOÀ — Chuyển toàn bộ giao diện sang tiếng Anh

> Việc này **chỉ đụng frontend**. Phần backend của bạn đã xong và đã merge vào
> `main`, không cần sửa gì thêm ở đó.

---

## Khối lượng thật

Đã đếm bằng script, không phải ước chừng:

| | Số chỗ | Số file |
|---|---|---|
| Chữ trong template `.html` | ~556 | 48 |
| Chuỗi hiển thị trong `.ts` (đã trừ chú thích) | ~262 | 40 |
| **Tổng** | **~818** | **88** |

Nhiều nhưng phần lớn là chữ ngắn (nhãn nút, placeholder). Làm theo thứ tự ở mục
"Bắt đầu từ đâu" thì mỗi buổi xong được một mảng.

---

## ⛔ BỐN THỨ TUYỆT ĐỐI KHÔNG DỊCH

Đây là phần quan trọng nhất của tài liệu này. Dịch nhầm mấy thứ dưới đây thì app
hỏng, mà lỗi lại không hiện ra ngay lúc sửa.

### 1. Chú thích trong code — GIỮ NGUYÊN TIẾNG VIỆT

Chú thích là tài liệu học của cả nhóm. Dịch sang tiếng Anh là mất sạch giá trị đó
và khối lượng công việc tăng gấp ba.

```ts
// ✅ ĐÚNG — chú thích tiếng Việt, chữ hiển thị tiếng Anh
// Thiếu query param → trả mảng rỗng, KHÔNG phải 500.
this.addToast('Board created successfully!', 'success');
```

### 2. Giá trị là hợp đồng dữ liệu với backend

Những chuỗi này backend đang so sánh bằng `===`. Đổi một chữ là backend trả 400.

```ts
visibility: 'workspace' | 'private' | 'public'   // ⛔ không đổi
background: 'bg-board-blue' | 'bg-board-purple'  // ⛔ tên CSS class, không đổi
role: 'owner' | 'admin' | 'member'               // ⛔ khớp CHECK trong database
priority: 'low' | 'medium' | 'high'              // ⛔ khớp CHECK trong database
```

### 3. Khoá localStorage

Đổi khoá là mọi người đang dùng app mất sạch dữ liệu đã lưu:

```
trello_user  trello_boards  trello_workspaces_data  trello_org_registry
trello_org_invites  trello_active_org  trello_theme  trello_registered_users
trello_chat_panel_width  trello_chat_panel_collapsed
```

### 4. Danh sách slug hệ thống

`frontend/src/app/utils/slug.util.ts` → `RESERVED_SLUGS`. Đây là các từ khoá URL,
không phải chữ hiển thị.

---

## Bảng từ vựng — dùng thống nhất

Dịch mỗi nơi một kiểu là giao diện trông chắp vá. Chốt như sau:

| Tiếng Việt | Tiếng Anh |
|---|---|
| Bảng (Kanban) | Board |
| Không gian làm việc | Workspace |
| Tổ chức | Organization |
| Danh sách / Cột | List |
| Thẻ | Card |
| Nhãn | Label |
| Thành viên | Member |
| Trưởng nhóm / Chủ sở hữu | Owner |
| Lời mời | Invitation |
| Mời | Invite |
| Đăng nhập / Đăng xuất | Sign in / Sign out |
| Đăng ký | Sign up |
| Cài đặt | Settings |
| Hồ sơ | Profile |
| Tạo / Sửa / Xoá | Create / Edit / Delete |
| Huỷ | Cancel |
| Lưu | Save |
| Quyền riêng tư | Privacy |
| Riêng tư | Private |
| Hạn chót | Due date |
| Ưu tiên | Priority |
| Quá hạn | Overdue |
| Hoàn thành | Completed |
| Đang làm | In progress |
| Việc cần làm | To do |
| Nhật ký hoạt động | Activity log |
| Thống kê & Báo cáo | Statistics & Reports |

Câu thông báo thì dịch theo nghĩa, đừng dịch từng chữ:

```
"Đã tạo bảng mới "X"!"        →  "Board "X" created!"
"Bạn cần đăng nhập."          →  "You need to sign in."
"Đường dẫn này đã có người dùng." →  "This URL is already taken."
```

---

## Một chỗ dễ quên: định dạng ngày giờ

Ba chỗ đang khoá cứng `vi-VN`, đổi sang `en-US`:

```
components/chat/message-item/message-item.ts:44
components/board/comment-list/comment-list.ts:48
services/board.service.ts:56
```

Và hàm `relativeTimeFrom()` trong `services/board.service.ts` trả về chữ tiếng Việt
("Vừa xong", "2 phút trước", "Hôm qua") — dịch cả phần này.

---

## Bắt đầu từ đâu

Làm theo thứ tự này để lúc nào cũng có thứ bấm thử được, và để nếu phải dừng giữa
chừng thì phần đã xong vẫn dùng được:

| # | Mảng | File chính | Ước lượng |
|---|---|---|---|
| 1 | Đăng nhập / Đăng ký | `pages/login/`, `pages/register/` | ~65 chỗ |
| 2 | Header + điều hướng | `components/header/` | ~30 chỗ |
| 3 | Trang Workspace | `pages/workspace/`, `components/workspace/` | ~150 chỗ |
| 4 | Trang Board | `pages/board/`, `components/board/` | ~280 chỗ |
| 5 | Cài đặt | `pages/settings/`, `components/settings/` | ~180 chỗ |
| 6 | Chat + còn lại | `components/chat/`, `layouts/`, `guards/` | ~110 chỗ |

Xong mỗi mảng thì **mở trình duyệt bấm thử mảng đó** rồi mới sang mảng tiếp theo.
Đừng sửa hết 88 file rồi mới chạy — hỏng thì không biết hỏng ở đâu.

---

## Trước khi bắt đầu — BẮT BUỘC

Nhánh của bạn đang ở commit cũ, `main` đã đi trước 4 commit (có phần tích hợp
frontend, đổi API sang camelCase, và tách interface ra thư mục `models/`).

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b feat/hoa-english
git push -u origin feat/hoa-english
```

⚠️ **Làm trên nhánh mới, đừng làm trên `main`.** Huy cũng đang sửa frontend
(landing page) — hai người cùng đẩy thẳng vào `main` là đụng nhau ngay.

Chạy thử để chắc mọi thứ đang xanh trước khi động vào:

```bash
cd frontend && npm start        # cửa sổ 1
cd backend  && npm run start:dev # cửa sổ 2
```

---

## Cách làm với AI Agent

Đưa cho AI Agent **từng file một**, kèm câu này:

```
Dịch toàn bộ chữ HIỂN THỊ trong file này sang tiếng Anh.

KHÔNG được đụng vào:
- Chú thích trong code (giữ nguyên tiếng Việt)
- Giá trị 'workspace' | 'private' | 'public', 'owner' | 'admin' | 'member',
  'low' | 'medium' | 'high', các class 'bg-board-*'
- Khoá localStorage bắt đầu bằng 'trello_'
- Tên biến, tên hàm, tên file

Dùng đúng bảng từ vựng trong backend/docs/VIEC-DICH-SANG-TIENG-ANH.md.
Dịch theo nghĩa, không dịch từng chữ.
```

Làm xong mỗi file thì **tự đọc lại diff** (`git diff <file>`) xem AI có lỡ đụng
vào chú thích hay giá trị hợp đồng không. Đây là loại lỗi build không bắt được.

---

## Xong khi nào

- [ ] Không còn chữ tiếng Việt nào **hiển thị ra màn hình** (chú thích thì còn)
- [ ] `npx ng build` chạy sạch
- [ ] Bấm thử đủ 6 mảng ở trên trên trình duyệt
- [ ] `git diff` không có dòng nào sửa chú thích
- [ ] Ba chỗ `vi-VN` đã đổi sang `en-US`
- [ ] Chạy `cd backend && python3 scripts/kiem-tra-hoa.py` — vẫn **59/59**
      (không liên quan trực tiếp, nhưng chắc chắn bạn không lỡ đụng backend)

Tự kiểm nhanh bằng lệnh này — nó tìm chữ tiếng Việt còn sót **ngoài chú thích**:

```bash
cd frontend/src/app
grep -rnP '[àáảãạăâèéêìíòóôơùúưỳýđ]' --include='*.html' . | head -30
```

Template thì mọi chữ tiếng Việt đều là chữ hiển thị, nên lệnh trên phải ra rỗng
là đạt.

---

## Phần backend để sau

Backend còn **105 thông báo lỗi tiếng Việt** ("Bạn không thuộc tổ chức này.",
"Đường dẫn này đã có người dùng."...). Chúng hiện thẳng lên toast, nên giao diện
tiếng Anh mà popup lỗi tiếng Việt sẽ hơi chắp vá.

Đây là **đợt sau**, làm khi Hoàng đã merge xong — vì các thông báo đó nằm rải rác
ở cả `cards/`, `comments/`, `chat/` mà Hoàng đang sửa dở. Chưa cần lo bây giờ.
