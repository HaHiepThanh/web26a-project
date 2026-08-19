# Schema Database — Trello Clone

> 💾 SQL chạy được: [`database.sql`](database.sql) — dán vào **Supabase → SQL Editor → Run**.
> Sau đó tạo Storage bucket `card-attachments` (để **private**).
>
> File này giải thích **mỗi bảng làm gì, mỗi cột để làm gì**.

**Tổng cộng: 20 bảng + 3 view.**

Ký hiệu dùng trong tài liệu:
`PK` = khoá chính · `FK` = khoá ngoại · `null` = được để trống · `uniq` = không trùng

---

## 1. Kiến trúc (ngắn gọn)

```
[Angular] --gửi token--> [NestJS backend] --service_role key--> [Supabase Postgres]
```

| Việc | Ai lo |
|---|---|
| Đăng nhập, mật khẩu, JWT | **Firebase Auth** |
| Kiểm tra quyền, đọc/ghi DB | **NestJS backend** |
| Lưu dữ liệu | **Supabase Postgres** |
| Lưu file/ảnh | **Supabase Storage** |

⚠️ Backend dùng `service_role key` nên **RLS bị bỏ qua** → DB không tự bảo vệ.
Mọi câu query trong backend **bắt buộc** kèm `where org_id = ?`, quên là lộ dữ liệu
tổ chức khác.

---

## 2. Auth — Firebase lo gì, mình lo gì?

| Việc | Ai làm |
|---|---|
| Băm mật khẩu (scrypt) + salt riêng mỗi user | ✅ Firebase |
| Tạo JWT (ID token), hạn 1 giờ | ✅ Firebase |
| Tự gia hạn token | ✅ Firebase |
| Kiểm tra chữ ký token | ✅ Firebase Admin SDK |
| **Kiểm tra user có quyền trong tổ chức không** | ❌ **Mình tự làm** (bảng `organization_members`) |

> **Không tự viết hàm mã hoá mật khẩu.** Firebase làm rồi, tự viết chỉ dễ sai hơn.
> Vì vậy bảng `users` **không có cột password**.

**Luồng chạy:**

```
1. User đăng nhập          → Firebase trả về token (JWT)
2. Frontend gọi API        → gắn header: Authorization: Bearer <token>
3. Backend kiểm tra token  → sai/hết hạn thì trả 401  ← AUTHENTICATION (bạn là ai?)
4. Backend kiểm tra quyền  → không thuộc org thì 403  ← AUTHORIZATION (được làm gì?)
5. Query DB                → luôn kèm where org_id = ?
```

| | 401 Unauthorized | 403 Forbidden |
|---|---|---|
| Nghĩa là | Chưa đăng nhập / token hỏng | Đã đăng nhập nhưng không đủ quyền |

---

## 3. Sơ đồ quan hệ

```
users
  └─ organization_members ─ organizations          (1 user ở nhiều tổ chức)
                                ├─ organization_invites
                                └─ workspaces       (tổ chức có nhiều workspace)
                                     ├─ workspace_members
                                     └─ boards      (workspace có nhiều board)
                                          ├─ board_members
                                          ├─ board_stars
                                          ├─ labels
                                          ├─ activity_logs
                                          ├─ messages
                                          ├─ board_saved_filters
                                          ├─ board_highlight_groups
                                          └─ lists   (board có nhiều cột)
                                               └─ cards   (cột có nhiều thẻ)
                                                    ├─ card_labels
                                                    ├─ checklist_items
                                                    ├─ comments
                                                    └─ card_attachments
```

---

## 4. Chi tiết từng bảng

### 4.1. `users` — Hồ sơ người dùng

Lưu thông tin hiển thị của người dùng. Backend tự tạo bản ghi này sau lần đăng nhập
đầu tiên. **Không lưu mật khẩu** (Firebase giữ).

```
users
├── id            text PK   -- Firebase uid, vd 'k3jHs8xY...'. KHÔNG phải uuid!
├── email         text      -- Email đăng nhập
├── display_name  text null -- Tên hiển thị, vd 'Nguyễn Văn Nam'
├── username      text uniq -- Tên đăng nhập, không được trùng
├── phone         text null -- Số điện thoại
├── job_title     text null -- Chức vụ, vd 'Trưởng nhóm phát triển'
├── avatar_url    text null -- Link ảnh đại diện
├── language      text      -- Ngôn ngữ giao diện: 'vi' | 'en' | 'ja' | 'ko' | 'zh'
├── timezone      text      -- Múi giờ, vd 'UTC+7'
├── created_at    timestamptz -- Lúc tạo tài khoản
└── updated_at    timestamptz -- Lúc sửa hồ sơ gần nhất
```

---

### 4.2. `organizations` — Tổ chức (công ty/team)

**Ranh giới cô lập dữ liệu**: tổ chức A không bao giờ thấy dữ liệu tổ chức B.
1 người có thể ở nhiều tổ chức cùng lúc.

```
organizations
├── id          uuid PK
├── name        text      -- Tên tổ chức, vd 'Công ty ABC'
├── icon        text      -- Emoji hiện ở sidebar, mặc định '🏢'
├── slug        text uniq null -- Tên rút gọn cho URL đẹp (chưa dùng)
├── owner_id    text FK → users.id  -- Người tạo, có toàn quyền
└── created_at  timestamptz
```

### 4.3. `organization_members` — Ai thuộc tổ chức nào

**Bảng quan trọng nhất để phân quyền** — backend đọc bảng này để quyết định cho phép
hay từ chối request.

```
organization_members
├── id         uuid PK
├── org_id     uuid FK → organizations.id
├── user_id    text FK → users.id
├── role       text      -- 'owner' (toàn quyền) | 'member' (thường)
├── joined_at  timestamptz -- Lúc vào tổ chức
└── uniq (org_id, user_id)  -- 1 người chỉ có 1 dòng trong 1 tổ chức
```

### 4.4. `organization_invites` — Lời mời vào tổ chức

Mời trực tiếp 1 người, họ phải **bấm Đồng ý** mới vào (không phải thêm thẳng).

```
organization_invites
├── id            uuid PK
├── org_id        uuid FK → organizations.id  -- Mời vào tổ chức nào
├── to_user_id    text FK → users.id  -- Mời AI
├── from_user_id  text FK → users.id  -- AI mời
├── status        text      -- 'pending' (đang chờ) | 'accepted' | 'declined'
├── created_at    timestamptz -- Lúc gửi lời mời
└── responded_at  timestamptz null -- Lúc bấm đồng ý/từ chối, chưa trả lời thì null
```

> 💡 Có ràng buộc: **1 người chỉ có 1 lời mời đang chờ cho mỗi tổ chức** (chặn spam),
> nhưng sau khi họ từ chối thì vẫn mời lại được.

---

### 4.5. `workspaces` — Không gian làm việc

Nhóm các board lại theo phòng ban/dự án. Thuộc về đúng 1 tổ chức.

```
workspaces
├── id          uuid PK
├── org_id      uuid FK → organizations.id  -- Thuộc tổ chức nào
├── name        text      -- Tên, vd 'Dự án Website'
├── icon        text      -- Emoji người dùng tự chọn, mặc định '📂'
├── icon_bg     text      -- Màu nền icon: 'bg-board-blue' | purple | green | teal | orange | red
├── description text null -- Mô tả ngắn
├── created_by  text FK → users.id
└── created_at  timestamptz
```

### 4.6. `workspace_members` — Thành viên của workspace

Khác `organization_members`: một người ở trong tổ chức **chưa chắc** thuộc workspace nào.

```
workspace_members
├── workspace_id uuid FK → workspaces.id  ┐
├── user_id      text FK → users.id       ┘ PK gộp 2 cột
├── role         text      -- 'owner' | 'member'
└── joined_at    timestamptz
```

---

### 4.7. `boards` — Bảng Kanban

```
boards
├── id           uuid PK
├── org_id       uuid FK → organizations.id
├── workspace_id uuid FK → workspaces.id  -- Nằm trong workspace nào
├── name         text      -- Tên bảng, vd 'Sprint 1'
├── visibility   text      -- Ai xem được:
│                          --   'workspace' = cả workspace (mặc định)
│                          --   'private'   = chỉ người trong board_members
│                          --   'public'    = ai trong tổ chức cũng xem được
├── background   text null -- Màu nền trang board: 'bg-board-blue' | purple | ...
├── created_by   text FK → users.id
└── created_at   timestamptz
```

### 4.8. `board_members` — Ai xem được board riêng tư

Chỉ dùng khi `boards.visibility = 'private'`.

```
board_members
├── board_id uuid FK → boards.id ┐ PK gộp 2 cột
└── user_id  text FK → users.id  ┘
```

### 4.9. `board_stars` — Đánh dấu sao

⭐ **Riêng từng người**: A gắn sao thì B không thấy. Vì vậy phải là bảng riêng,
không thể là cột `starred` trong `boards`.

```
board_stars
├── board_id   uuid FK → boards.id ┐ PK gộp 2 cột
├── user_id    text FK → users.id  ┘
└── starred_at timestamptz -- Lúc gắn sao
```

---

### 4.10. `lists` — Cột trong board

Vd: "Việc cần làm" / "Đang làm" / "Hoàn thành".

```
lists
├── id         uuid PK
├── org_id     uuid FK → organizations.id
├── board_id   uuid FK → boards.id  -- Thuộc board nào
├── name       text      -- Tên cột
├── color      text null -- Mã màu hex cho chấm tròn nhỏ trên tiêu đề cột, vd '#f59e0b'
├── position   float     -- Thứ tự cột từ trái sang (xem ghi chú bên dưới)
└── created_at timestamptz
```

> 📌 **Vì sao `position` là số thực (float) chứ không phải số nguyên?**
> Khi kéo 1 thẻ vào giữa thẻ có position `1.0` và `2.0`, ta chỉ cần đặt nó thành
> `1.5` — không phải đánh số lại toàn bộ danh sách. Nhanh hơn rất nhiều.

### 4.11. `cards` — Thẻ công việc

Bảng trung tâm của cả ứng dụng.

```
cards
├── id           uuid PK
├── org_id       uuid FK → organizations.id
├── list_id      uuid FK → lists.id  -- Đang nằm ở cột nào (kéo-thả = đổi cột này)
├── title        text      -- Tiêu đề thẻ
├── description  text null -- Mô tả chi tiết
├── assignee_id  text FK → users.id, null -- Người phụ trách, chưa gán thì null
├── due_date     date null -- Hạn chót, vd '2026-09-30'
├── priority     text      -- Mức ưu tiên: 'low' | 'medium' | 'high'
│                          -- ⚠️ PHẢI đúng 3 giá trị tiếng Anh này (khớp frontend)
├── completed_at timestamptz null -- Lúc hoàn thành; CHƯA xong thì null
│                          -- ⭐ Cột quan trọng nhất cho THỐNG KÊ (xem mục 5)
├── position     float     -- Thứ tự thẻ trong cột
├── created_by   text FK → users.id
├── created_at   timestamptz
└── updated_at   timestamptz
```

> 📌 **`completed_at` dùng để làm gì?**
> - `null` → thẻ chưa xong
> - có giá trị → thẻ đã xong, và biết luôn **xong lúc nào**
>
> Nhờ vậy tính được: đã xong bao nhiêu thẻ, có đúng hạn không
> (`completed_at <= due_date`), mất bao lâu để làm xong.

---

### 4.12. `labels` — Nhãn màu

Mỗi board tự định nghĩa bộ nhãn riêng.

```
labels
├── id       uuid PK
├── org_id   uuid FK → organizations.id
├── board_id uuid FK → boards.id  -- Nhãn của board nào
├── name     text  -- Tên nhãn, vd 'Bug', 'Tính năng'
└── color    text  -- Mã màu hex, vd '#ef4444'
```

### 4.13. `card_labels` — Gắn nhãn cho thẻ

Bảng nối **nhiều-nhiều**: 1 thẻ gắn nhiều nhãn, 1 nhãn dùng cho nhiều thẻ.

```
card_labels
├── card_id  uuid FK → cards.id  ┐ PK gộp 2 cột
└── label_id uuid FK → labels.id ┘
```

---

### 4.14. `checklist_items` — Danh sách việc con trong thẻ

```
checklist_items
├── id       uuid PK
├── card_id  uuid FK → cards.id  -- Thuộc thẻ nào
├── content  text      -- Nội dung việc cần làm
├── is_done  boolean   -- Đã tick chưa (mặc định false)
└── position float     -- Thứ tự trong danh sách
```

### 4.15. `comments` — Bình luận trong thẻ

```
comments
├── id         uuid PK
├── card_id    uuid FK → cards.id
├── user_id    text FK → users.id  -- Người bình luận
├── content    text      -- Nội dung
└── created_at timestamptz
```

### 4.16. `card_attachments` — Tệp đính kèm & ảnh bìa

⚠️ **File thật nằm trên Supabase Storage**, bảng này chỉ lưu đường dẫn.
Không nhét file vào DB — sẽ làm DB phình to và mọi câu query chậm đi.

```
card_attachments
├── id           uuid PK
├── card_id      uuid FK → cards.id
├── name         text    -- Tên file gốc người dùng tải lên, vd 'thiet-ke.png'
├── mime_type    text    -- Loại file, vd 'image/png', 'application/pdf'
├── storage_path text    -- Đường dẫn trên Storage, vd 'cards/<card_id>/abc.png'
├── size_bytes   bigint  -- Dung lượng (byte)
├── is_image     boolean -- Có phải ảnh không (để biết nên hiện preview hay icon file)
├── is_cover     boolean -- Có phải ảnh bìa của thẻ không
├── uploaded_by  text FK → users.id
└── created_at   timestamptz
```

> 💡 Có ràng buộc: **mỗi thẻ tối đa 1 ảnh bìa** — DB tự chặn, không cần code kiểm tra.

---

### 4.17. `activity_logs` — Nhật ký hoạt động

Ghi lại ai làm gì. Vừa để hiện feed hoạt động, vừa là nguồn tính
"thành viên hoạt động gần nhất lúc nào".

```
activity_logs
├── id          uuid PK
├── org_id      uuid FK → organizations.id
├── board_id    uuid FK → boards.id  -- Xảy ra ở board nào
├── card_id     uuid FK → cards.id, null -- Liên quan thẻ nào (để lọc lịch sử theo thẻ)
├── user_id     text FK → users.id  -- Ai làm
├── action_type text  -- Loại hành động, dùng để lọc/đếm:
│                     --   'card_created'  | 'card_moved'   | 'card_updated'
│                     --   'card_deleted'  | 'card_assigned' | 'comment_added'
├── target_id   uuid null -- id đối tượng khác liên quan (list/comment...)
├── action_text text  -- Câu mô tả sẵn để hiển thị:
│                     --   "Nam đã chuyển thẻ 'Fix bug' sang Đang làm"
└── created_at  timestamptz -- Lúc xảy ra
```

### 4.18. `messages` — Chat trong board

Khung chat bên trái trang Board. AI đọc tin nhắn để phát hiện tin giao việc rồi
**gợi ý** tạo thẻ (người dùng phải bấm xác nhận mới thật sự tạo).

```
messages
├── id             uuid PK
├── org_id         uuid FK → organizations.id
├── board_id       uuid FK → boards.id  -- Chat của board nào
├── user_id        text FK → users.id   -- Người gửi
├── content        text      -- Nội dung tin nhắn
├── source_card_id uuid FK → cards.id, null
│                            -- Thẻ được tạo ra TỪ tin nhắn này (nếu có)
└── created_at     timestamptz
```

---

### 4.19. `board_saved_filters` — Bộ lọc đã lưu

Người dùng lọc board rồi bấm "Lưu thành nút nhanh". **Riêng từng người, từng board.**

```
board_saved_filters
├── id           uuid PK
├── board_id     uuid FK → boards.id
├── user_id      text FK → users.id  -- Bộ lọc của riêng ai
├── name         text     -- Tên nút, vd 'Việc gấp của tôi'
├── assignee_ids text[]   -- Lọc theo người phụ trách; '__UNASSIGNED__' = chưa gán ai
├── label_ids    text[]   -- Lọc theo nhãn; '__NO_LABEL__' = chưa có nhãn
├── priorities   text[]   -- Lọc theo ưu tiên: 'low' | 'medium' | 'high'
├── date_filter  text null-- Lọc theo ngày:
│                         --   'overdue' (quá hạn) | 'today' (hôm nay)
│                         --   'week' (7 ngày tới) | 'no_due' (không có hạn)
└── created_at   timestamptz
```

### 4.20. `board_highlight_groups` — Nhóm thẻ tô sáng

Khác bảng trên: lưu **thẳng danh sách id thẻ** (chọn tay bằng Shift+click),
không lọc theo điều kiện.

```
board_highlight_groups
├── id         uuid PK
├── board_id   uuid FK → boards.id
├── user_id    text FK → users.id
├── name       text   -- Tên nhóm
├── card_ids   uuid[] -- Danh sách id các thẻ đã chọn
└── created_at timestamptz
```

---

## 5. Thống kê từng board 📊

### Không có bảng thống kê riêng — và đó là cố ý

Số liệu được **tính trực tiếp từ `cards` + `activity_logs`** mỗi lần mở modal.

**Vì sao không tạo bảng `board_stats` lưu sẵn số liệu?**
Vì phải cập nhật nó ở **mọi** thao tác: tạo thẻ, xoá thẻ, kéo-thả, đổi người phụ
trách, đổi hạn… Chỉ cần **quên 1 chỗ** là số liệu sai vĩnh viễn, mà **không có lỗi
nào báo ra** → cực kỳ khó phát hiện. Tính trực tiếp thì luôn khớp với màn hình.

### Mỗi con số lấy từ đâu

| Hiển thị trên màn hình | Tính bằng |
|---|---|
| Đã hoàn thành | đếm thẻ có `completed_at` khác null |
| Đang làm | `completed_at` null và chưa quá hạn |
| Quá hạn | `completed_at` null **và** `due_date` < hôm nay |
| Tỷ lệ đúng hạn | số thẻ có `completed_at <= due_date` ÷ số thẻ đã xong có đặt hạn |
| Việc của từng người | gom nhóm theo `cards.assignee_id` |
| Hoạt động gần nhất | `max(activity_logs.created_at)` theo từng người |

### 3 view có sẵn (dùng như bảng thường)

| View | Trả về gì |
|---|---|
| `board_stats_overview` | 4 ô tổng quan: tổng thẻ, đã xong, đang làm, quá hạn, % đúng hạn |
| `board_member_workload` | Mỗi người: được giao / đã xong / đang làm / quá hạn / hoạt động gần nhất |
| `board_overdue_cards` | Danh sách thẻ quá hạn + số ngày trễ |

```sql
select * from board_stats_overview where board_id = '...';
```

---

## 6. Những thứ **không** lưu trong DB

Trạng thái giao diện thuần cục bộ → để ở `localStorage` trên trình duyệt:

| Dữ liệu | Key localStorage |
|---|---|
| Đang thu gọn cột nào | `trello_collapsed_lists_<boardId>` |
| Kiểu xem Column / Row | `trello_layout_mode_<boardId>` |
| Độ rộng khung chat | `trello_chat_panel_width` |
| Tổ chức đang chọn | `trello_active_org_<userId>` |
| Giao diện sáng/tối | `trello_theme` |

Vài giá trị **tự tính khi hiển thị**, không cần cột trong DB:

| Hiện trên màn hình | Lấy từ đâu |
|---|---|
| Tag phía trên tên board | Tên workspace viết hoa |
| Badge `KANBAN` | Chuỗi cố định |
| Số thành viên workspace | Đếm dòng trong `workspace_members` |

---

## 7. Đã sửa gì so với schema cũ

### 🐞 2 lỗi

| Vấn đề | Cũ (sai) | Mới (đúng) |
|---|---|---|
| `cards.priority` — DB chỉ nhận tiếng Việt nhưng frontend gửi tiếng Anh → **mọi lệnh tạo thẻ đều lỗi** | `'cao' \| 'trung' \| 'thap'` | `'low' \| 'medium' \| 'high'` |
| `boards.visibility` — frontend có 3 mức, DB chỉ có 2 | `'public' \| 'restricted'` | `'workspace' \| 'private' \| 'public'` |

Nếu **đã lỡ chạy** schema cũ, chạy đoạn này để vá:

```sql
alter table cards drop constraint if exists cards_priority_check;
update cards set priority = case priority
  when 'cao' then 'high' when 'trung' then 'medium'
  when 'thap' then 'low' else priority end;
alter table cards alter column priority set default 'medium';
alter table cards add constraint cards_priority_check
  check (priority in ('low','medium','high'));
```

### ➕ 6 bảng mới

| Bảng | Vì sao thiếu là hỏng |
|---|---|
| `workspace_members` | Frontend có màn quản lý thành viên workspace mà **không bảng nào lưu** |
| `board_stars` | Sao là **riêng từng người** — để thành cột thì A gắn sao B cũng thấy |
| `card_attachments` | Đính kèm + ảnh bìa thẻ, trước đây thiếu hoàn toàn |
| `organization_invites` | Luồng mời → **chờ đồng ý** (bảng `invites` cũ dùng token, khác hẳn) |
| `board_saved_filters` | Bộ lọc lưu thành nút nhanh |
| `board_highlight_groups` | Nhóm thẻ tô sáng chọn tay |

### ✏️ Cột thêm vào bảng cũ

| Bảng | Thêm cột |
|---|---|
| `users` | `username`, `phone`, `job_title`, `language`, `timezone`, `updated_at` |
| `organizations` | `icon` |
| `workspaces` | `icon`, `icon_bg`, `description`, `created_by` |
| `boards` | `background` |
| `lists` | `color` |
| `activity_logs` | `card_id` |

### 🔄 Đổi tên cho khớp frontend

| Cũ | Mới |
|---|---|
| `tenants` | `organizations` |
| `tenant_members` | `organization_members` |
| cột `tenant_id` | cột `org_id` |

### ❌ Bỏ đi

| Bỏ | Lý do |
|---|---|
| Bảng `invites` (mời bằng token) | Thay bằng `organization_invites` (mời trực tiếp, chờ đồng ý) |
| Cột `password` | Firebase giữ mật khẩu — **không bao giờ** lưu vào DB |

---

## 8. Checklist khi triển khai

- [ ] Chạy [`database.sql`](database.sql) trong Supabase SQL Editor
- [ ] Tạo Storage bucket `card-attachments`, để **private**
- [ ] (tuỳ chọn) Bỏ comment mục 13 trong `database.sql` để có dữ liệu mẫu test
- [ ] Đặt `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong `.env` của backend
- [ ] **Không** chạy `backend/migrations/0001` & `0002` — các cột đó đã có sẵn
- [ ] Rà lại backend: mọi query đã kèm `where org_id = ?` chưa
- [ ] Bỏ `password` khỏi model `User` ở frontend khi nối API thật
