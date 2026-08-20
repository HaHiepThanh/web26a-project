# Tra cứu database

Bảng và cột hay dùng, để khỏi phải đọc hết 744 dòng của `database.sql`.
Nguồn chuẩn vẫn là `database.sql` ở thư mục gốc — file này chỉ là bản rút gọn.

**Tên cột trong database là `snake_case`.** Viết `orgId` trong câu Supabase là
báo lỗi *column does not exist*.

---

## Của Huy

### `organizations` — tổ chức

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | tự sinh |
| `name` | text | |
| `slug` | text | **UNIQUE**, bắt buộc, không cho đổi về sau |
| `owner_id` | text | → `users.id` (Firebase uid) |
| `created_at` | timestamptz | |

Ràng buộc `slug`: chỉ chữ thường + số + gạch ngang, **3–30 ký tự**, không bắt đầu
/ kết thúc bằng gạch ngang, không có 2 gạch ngang liền nhau.

```
^[a-z0-9]+(-[a-z0-9]+)*$
```

Ngoài ra backend phải **tự chặn** các slug trùng route hệ thống (`login`,
`settings`, `board`, `api`, `admin`...). Danh sách đầy đủ ở
`frontend/src/app/utils/slug.util.ts` → `RESERVED_SLUGS`. Database không tự biết
chuyện này.

### `organization_members` — ai thuộc tổ chức nào, quyền gì

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | |
| `org_id` | uuid | → `organizations.id` |
| `user_id` | text | → `users.id` |
| `role` | text | `'owner'` \| `'admin'` \| `'member'` |
| `joined_at` | timestamptz | |

- `unique (org_id, user_id)` — 1 người không vào 2 lần cùng 1 tổ chức
- `uniq_org_single_owner` — **mỗi tổ chức chỉ được ĐÚNG 1 owner**

> Đây là bảng quan trọng nhất dự án. Gần như mọi endpoint đều phải đọc nó để biết
> user có quyền gì.

### `organization_invites` — lời mời

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | |
| `org_id` | uuid | |
| `to_user_id` | text | người được mời |
| `from_user_id` | text | người mời |
| `status` | text | `'pending'` \| `'accepted'` \| `'declined'` |
| `created_at`, `responded_at` | timestamptz | |

`uniq_pending_invite` — không mời trùng khi đang chờ, nhưng **được mời lại** sau
khi người ta đã từ chối.

### `workspaces`

| Cột | Kiểu |
|---|---|
| `id` | uuid |
| `org_id` | uuid |
| `name` | text |
| `description` | text (mặc định `''`) |
| `created_by` | text |
| `created_at` | timestamptz |

**Không có** `icon` / `icon_bg` — đã bỏ khỏi schema. Workspace chỉ hiển thị bằng tên.

### `workspace_members`

`workspace_id`, `user_id`, `role` (`'owner'` \| `'member'`), `joined_at`.
Khoá chính gộp `(workspace_id, user_id)`.

---

## Của Hoà

### `boards`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | |
| `org_id` | uuid | ⚠️ **phải điền**, không tự suy ra được |
| `workspace_id` | uuid | |
| `name` | text | |
| `visibility` | text | `'workspace'` (mặc định) \| `'private'` \| `'public'` |
| `background` | text | 1 trong 6: `bg-board-blue`, `-purple`, `-green`, `-teal`, `-orange`, `-red` |
| `background_image_path` | text | đường dẫn ảnh trên Supabase Storage, có thể null |
| `created_by` | text | |
| `created_at` | timestamptz | |

### `lists` — cột trong board

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | |
| `org_id` | uuid | ⚠️ phải điền |
| `board_id` | uuid | |
| `name` | text | |
| `position` | **double precision** | số thực, xem mục "position" bên dưới |
| `created_at` | timestamptz | |

**Không có** cột `color` — đã bỏ khỏi schema.

### `labels`

`id`, `org_id`, `board_id`, `name`, `color` (mã hex, vd `'#61bd4f'`).

### `card_labels` — bảng nối

`card_id`, `label_id`. **Khoá chính gộp `(card_id, label_id)`** → gắn nhãn 2 lần
sẽ báo lỗi trùng `23505`, không tạo 2 dòng.

---

## Của Hoàng

### `cards`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | |
| `org_id` | uuid | ⚠️ phải điền |
| `list_id` | uuid | thẻ thuộc **cột**, không thuộc thẳng board |
| `title` | text | |
| `description` | text | |
| `assignee_id` | text | người được giao, có thể null |
| `due_date` | date | |
| `priority` | text | **chỉ nhận** `'low'` \| `'medium'` \| `'high'`, mặc định `'medium'` |
| `completed_at` | timestamptz | set khi thẻ sang cột hoàn thành |
| `position` | double precision | |
| `created_by` | text | |
| `created_at`, `updated_at` | timestamptz | `updated_at` có trigger tự cập nhật |

> `cards` **không có** `board_id`. Muốn lấy thẻ của 1 board phải đi vòng qua
> `lists`: lấy list của board trước, rồi lấy card theo `list_id`.

### `comments`

`id`, `card_id`, `user_id`, `content`, `created_at`.

### `messages` — chat trong board

`id`, `org_id`, `board_id`, `user_id`, `content`, `source_card_id`, `created_at`.

### `activity_logs`

`id`, `org_id`, `board_id`, `card_id`, `user_id`, `action_type`, `target_id`,
`action_text`, `created_at`.

`action_type` **chỉ nhận** 6 giá trị: `card_created`, `card_moved`, `card_updated`,
`card_deleted`, `card_assigned`, `comment_added`.

---

## Dùng chung

### `users`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | **text** | Firebase uid, **không phải uuid** |
| `email` | text | |
| `display_name`, `username`, `phone`, `job_title`, `avatar_url` | text | `username` là UNIQUE |
| `created_at`, `updated_at` | timestamptz | |

**Không có cột `password`** — mật khẩu do Firebase giữ, backend không bao giờ thấy.

---

## `position` — số thực, không phải số nguyên

Cả `lists.position` và `cards.position` là `double precision`. Kéo 1 thẻ vào
**giữa** 2 thẻ khác chỉ cần lấy trung bình:

```
Thẻ A: position 1.0
Thẻ B: position 2.0
Chèn vào giữa → position = (1.0 + 2.0) / 2 = 1.5
```

Không phải đánh số lại cả cột. Chèn vào **đầu** thì lấy `min - 1`, vào **cuối**
thì lấy `max + 1`.

---

## Điều nguy hiểm nhất cần nhớ

`database.sql` mục 14 đã bật **RLS trên cả 20 bảng, không có policy nào** — nghĩa
là `anon key` không đọc/ghi được gì cả. Nhưng backend dùng **`service_role key`,
loại key này BỎ QUA RLS hoàn toàn**.

Nói cách khác: **database không bảo vệ gì cho bạn.** Mọi ràng buộc "user này chỉ
được xem dữ liệu tổ chức của mình" đều phải do code trong service làm.

```ts
// ❌ SAI — trả về board của mọi tổ chức
.from('boards').select('*').eq('id', boardId)

// ✅ ĐÚNG
.from('boards').select('*').eq('id', boardId).eq('org_id', orgIdCuaUser)
```
