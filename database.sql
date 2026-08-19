-- =============================================================================
-- TRELLO CLONE — DATABASE SCHEMA (Supabase Postgres)
-- =============================================================================
-- Tài liệu giải thích: schema.md
--
-- CÁCH CHẠY
--   Supabase : SQL Editor → New query → dán toàn bộ file này → Run
--   psql     : psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database.sql
--
--   Sau khi chạy: vào Storage → tạo bucket `card-attachments`, để PRIVATE.
--
-- NỘI DUNG
--   0. Reset      (đã comment — chỉ mở khi cần làm lại từ đầu)
--   1. Extensions
--   2. users
--   3. organizations, organization_members, organization_invites
--   4. workspaces, workspace_members
--   5. boards, board_members, board_stars
--   6. lists, cards
--   7. labels, card_labels
--   8. checklist_items, comments, card_attachments
--   9. activity_logs
--  10. messages
--  11. board_saved_filters, board_highlight_groups
--  12. View thống kê board (3 view)
--  13. Seed dữ liệu mẫu  (đã comment — chỉ mở khi cần test)
--
-- ⚠️ BẢO MẬT: backend dùng service_role key nên RLS bị BỎ QUA hoàn toàn.
--    DB không tự bảo vệ bạn — mọi query trong backend BẮT BUỘC kèm
--    `where org_id = ?`. Quên 1 chỗ là rò rỉ dữ liệu chéo tổ chức.
-- =============================================================================


-- =============================================================================
-- 0. RESET — xoá sạch để tạo lại từ đầu
-- =============================================================================
-- ⚠️ NGUY HIỂM: xoá TOÀN BỘ DỮ LIỆU. Chỉ dùng ở dev/local.
--    Bỏ dấu comment khối dưới nếu muốn chạy lại file này trên DB đã có bảng.
-- -----------------------------------------------------------------------------
/*
drop view  if exists board_overdue_cards     cascade;
drop view  if exists board_member_workload   cascade;
drop view  if exists board_stats_overview    cascade;
drop table if exists board_highlight_groups  cascade;
drop table if exists board_saved_filters     cascade;
drop table if exists messages                cascade;
drop table if exists activity_logs           cascade;
drop table if exists card_attachments        cascade;
drop table if exists comments                cascade;
drop table if exists checklist_items         cascade;
drop table if exists card_labels             cascade;
drop table if exists labels                  cascade;
drop table if exists cards                   cascade;
drop table if exists lists                   cascade;
drop table if exists board_stars             cascade;
drop table if exists board_members           cascade;
drop table if exists boards                  cascade;
drop table if exists workspace_members       cascade;
drop table if exists workspaces              cascade;
drop table if exists organization_invites    cascade;
drop table if exists organization_members    cascade;
drop table if exists organizations           cascade;
drop table if exists users                   cascade;
*/


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
-- gen_random_uuid() dùng làm khoá chính. Supabase bật sẵn pgcrypto, câu lệnh này
-- chỉ để chạy được trên Postgres thuần.

create extension if not exists "pgcrypto";


-- =============================================================================
-- 2. USERS
-- =============================================================================
-- id = Firebase uid (text), KHÔNG phải uuid, KHÔNG dùng auth.users của Supabase.
-- Backend upsert bản ghi này sau khi verify Firebase ID token lần đầu.
--
-- ⚠️ KHÔNG có cột `password`: Firebase Auth giữ mật khẩu (băm scrypt + salt riêng
--    mỗi user). Hệ thống của ta không bao giờ nhìn thấy mật khẩu gốc.

-- Không có cột language/timezone: app cố định English + UTC+7, không cho người
-- dùng đổi nên lưu vào DB là thừa.
create table users (
  id            text primary key,              -- Firebase uid
  email         text not null,
  display_name  text,
  username      text unique,
  phone         text,
  job_title     text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_users_email on users (email);


-- =============================================================================
-- 3. ORGANIZATION (tenant) — ranh giới cô lập dữ liệu
-- =============================================================================
-- Org A không bao giờ thấy dữ liệu org B.
-- 1 user thuộc nhiều org, 1 org có nhiều user (quan hệ nhiều-nhiều).

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Đường dẫn riêng của tổ chức, dùng làm tiền tố mọi URL:
  --   /thanh-organization/board/<uuid>
  -- BẮT BUỘC nhập lúc tạo, DUY NHẤT toàn hệ thống, và KHÔNG cho đổi về sau
  -- (đổi slug = mọi link đã chia sẻ chết ngay).
  -- Ràng buộc: chỉ chữ thường + số + gạch ngang, 3-30 ký tự, không bắt đầu/kết
  -- thúc bằng gạch ngang, không có 2 gạch ngang liền nhau.
  slug        text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 30),
  owner_id    text not null references users(id),
  created_at  timestamptz not null default now()
);

create index idx_organizations_owner on organizations (owner_id);

-- ⚠️ Backend PHẢI chặn thêm các slug trùng route hệ thống, DB không tự biết.
--    Vì slug nằm ngay ở GỐC url (/thanh-organization/...), nó dùng chung
--    namespace với mọi route của app — một tổ chức đặt slug 'settings' sẽ
--    chiếm mất trang /settings.
--
--    Danh sách phải khớp với RESERVED_SLUGS trong
--    frontend/src/app/utils/slug.util.ts (sửa 1 bên thì sửa cả bên kia):
--      route đang có : login, register, forgot-password, reset-password,
--                      workspace, board, settings, dashboard, members,
--                      onboarding, not-found, 404
--      file tĩnh     : assets, static, public, favicon.ico, index.html
--      hạ tầng       : api, admin, auth, app, www, mail, cdn
--      để dành       : join, invite, new, help, about, terms, privacy, pricing,
--                      blog, docs, support, status, search, notifications,
--                      me, user, users, profile, org, orgs, o
--
--    ⚠️ THÊM ROUTE GỐC MỚI THÌ PHẢI THÊM VÀO DANH SÁCH NÀY. Slug đã cấp thì
--       không cho đổi, nên quên một từ = kẹt vĩnh viễn với route đó.


-- Bảng backend đọc để PHÂN QUYỀN (authorization).
--
-- 3 mức quyền:
--   owner  — chủ tổ chức. Làm được MỌI THỨ. Giữ riêng 2 quyền sống còn:
--            xoá cả tổ chức, và chuyển quyền owner cho người khác.
--   admin  — người được uỷ quyền (vd trưởng nhóm IT/BA). Làm được mọi thứ của
--            owner TRỪ 2 quyền trên: tạo/xoá workspace, tạo/xoá board,
--            mời & xoá thành viên, phong admin cho người khác.
--   member — thành viên thường: chỉ dùng workspace/board được cho vào.
--
-- ⚠️ DB chỉ lưu giá trị role. Việc CHẶN thao tác là do backend guard làm.
create table organization_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  role       text not null default 'member'
               check (role in ('owner', 'admin', 'member')),
  joined_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Mỗi tổ chức chỉ có ĐÚNG 1 owner — chuyển quyền owner phải hạ owner cũ xuống
-- admin trong cùng 1 transaction.
create unique index uniq_org_single_owner
  on organization_members (org_id) where role = 'owner';

create index idx_org_members_user on organization_members (user_id);
create index idx_org_members_org  on organization_members (org_id);


-- Lời mời tham gia org: gửi trực tiếp tới 1 user, người đó phải BẤM ĐỒNG Ý mới vào.
-- Khớp luồng frontend: chuông thông báo trên header → Đồng ý / Từ chối.
create table organization_invites (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  to_user_id    text not null references users(id) on delete cascade,
  from_user_id  text not null references users(id),
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);

-- Partial unique index: chặn mời trùng khi đang chờ, nhưng vẫn cho mời lại
-- sau khi người ta đã từ chối.
create unique index uniq_pending_invite
  on organization_invites (org_id, to_user_id)
  where status = 'pending';

create index idx_org_invites_to_user on organization_invites (to_user_id, status);

-- 💡 Muốn thêm kiểu mời bằng LINK có token thì tạo bảng riêng, đừng gộp chung:
--    organization_invite_links(id, org_id, token unique, created_by, expires_at)


-- =============================================================================
-- 4. WORKSPACE — nhóm board theo phòng ban/dự án
-- =============================================================================

create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  -- Chỉ còn MÀU nền, KHÔNG có emoji: giao diện hiển thị chữ cái đầu của `name`
  -- trên nền màu này (vd 'Đồ án CNTT' → 'ĐC'). Tổ chức thì không có cả màu.
  icon_bg     text not null default 'bg-board-blue'
                check (icon_bg in ('bg-board-blue','bg-board-purple','bg-board-green',
                                   'bg-board-teal','bg-board-orange','bg-board-red')),
  description text default '',
  created_by  text not null references users(id),
  created_at  timestamptz not null default now()
);

create index idx_workspaces_org on workspaces (org_id);


-- Thành viên của RIÊNG từng workspace. Khác organization_members: 1 người có thể
-- ở trong org nhưng không thuộc workspace nào cả.
create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index idx_workspace_members_user on workspace_members (user_id);


-- =============================================================================
-- 5. BOARD + quyền xem + đánh dấu sao
-- =============================================================================

create table boards (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  -- 'workspace' = mọi thành viên workspace xem được (mặc định)
  -- 'private'   = chỉ người có tên trong board_members
  -- 'public'    = ai trong org cũng xem được
  visibility   text not null default 'workspace'
                 check (visibility in ('workspace', 'private', 'public')),
  background   text check (background in ('bg-board-blue','bg-board-purple','bg-board-green',
                                          'bg-board-teal','bg-board-orange','bg-board-red')),
  -- Ảnh nền tuỳ chọn người dùng tự tải lên lúc tạo board. File THẬT nằm trên
  -- Supabase Storage (giống card_attachments), DB chỉ giữ đường dẫn.
  -- Có ảnh thì ảnh được ưu tiên; `background` ở trên vẫn giữ nguyên làm màu dự
  -- phòng cho lúc ảnh lỗi/chưa tải xong — nên KHÔNG cấm điền cả hai cột.
  -- ⚠️ Frontend phải nén ảnh (thu nhỏ ≤1600px, JPEG ~q0.82) TRƯỚC khi upload:
  --    ảnh máy ảnh gốc vài MB là quá nặng cho một tấm nền.
  background_image_path text,
  created_by   text not null references users(id),
  created_at   timestamptz not null default now()
);

create index idx_boards_workspace on boards (workspace_id);
create index idx_boards_org on boards (org_id);


-- Danh sách người được xem khi visibility = 'private'.
create table board_members (
  board_id uuid not null references boards(id) on delete cascade,
  user_id  text not null references users(id) on delete cascade,
  primary key (board_id, user_id)
);


-- Đánh dấu sao — RIÊNG TỪNG USER. Vì thế phải là bảng nối, không thể là cột
-- boolean trong `boards` (A gắn sao thì B cũng thấy → sai).
create table board_stars (
  board_id   uuid not null references boards(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  starred_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index idx_board_stars_user on board_stars (user_id);


-- =============================================================================
-- 6. LIST (cột) + CARD (thẻ)
-- =============================================================================
-- `position` dùng float chứ không phải int: kéo-thả 1 thẻ vào giữa 2 thẻ khác chỉ
-- cần lấy trung bình 2 position (1.0 và 2.0 → 1.5), không phải đánh số lại cả list.

-- Không có cột color: app chưa có tính năng cho người dùng đổi màu cột,
-- chấm tròn trên tiêu đề cột dùng màu xám cố định.
create table lists (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  board_id   uuid not null references boards(id) on delete cascade,
  name       text not null,
  position   double precision not null,
  created_at timestamptz not null default now()
);

create index idx_lists_board on lists (board_id, position);


create table cards (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  list_id      uuid not null references lists(id) on delete cascade,
  title        text not null,
  description  text,
  assignee_id  text references users(id) on delete set null,
  due_date     date,

  -- ⚠️ GIÁ TRỊ PHẢI KHỚP frontend (models/card.model.ts → CardPriority).
  --    Migration 0001 cũ ghi ('cao','trung','thap') là SAI → mọi INSERT bị chặn.
  priority     text not null default 'medium'
                 check (priority in ('low', 'medium', 'high')),

  -- Set khi thẻ chuyển sang cột hoàn thành. Cột SỐNG CÒN cho thống kê:
  -- dùng tính "đã xong", "đúng hạn", "thời gian xử lý".
  completed_at timestamptz,

  position     double precision not null,
  created_by   text not null references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_cards_list     on cards (list_id, position);
create index idx_cards_assignee on cards (assignee_id);
create index idx_cards_org      on cards (org_id);

-- Partial index: chỉ index thẻ CHƯA xong — đúng thứ màn hình thống kê và bộ lọc
-- "quá hạn" cần, index nhỏ hơn nhiều so với index toàn bảng.
create index idx_cards_due_date on cards (due_date) where completed_at is null;


-- =============================================================================
-- 7. LABEL — nhãn màu (phạm vi theo board)
-- =============================================================================

create table labels (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  name     text not null,
  color    text not null                       -- mã hex, vd '#61bd4f'
);

create index idx_labels_board on labels (board_id);


-- Bảng nối nhiều-nhiều: 1 thẻ nhiều nhãn, 1 nhãn gắn nhiều thẻ.
create table card_labels (
  card_id  uuid not null references cards(id) on delete cascade,
  label_id uuid not null references labels(id) on delete cascade,
  primary key (card_id, label_id)
);

-- Index chiều ngược lại (PK đã lo chiều card_id → label_id).
create index idx_card_labels_label on card_labels (label_id);


-- =============================================================================
-- 8. NỘI DUNG TRONG THẺ — checklist, bình luận, đính kèm
-- =============================================================================

create table checklist_items (
  id        uuid primary key default gen_random_uuid(),
  card_id   uuid not null references cards(id) on delete cascade,
  content   text not null,
  is_done   boolean not null default false,
  position  double precision not null
);

create index idx_checklist_card on checklist_items (card_id, position);


create table comments (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references cards(id) on delete cascade,
  user_id    text not null references users(id),
  content    text not null,
  created_at timestamptz not null default now()
);

create index idx_comments_card on comments (card_id, created_at);


-- File THẬT nằm trên Supabase Storage, DB chỉ giữ đường dẫn.
-- (Code demo hiện lưu base64 trong RAM — khi nối backend thật phải đổi sang Storage,
--  nhét base64 vào DB sẽ phình bảng và làm mọi câu SELECT chậm.)
-- 📦 Cần tạo bucket `card-attachments` ở Supabase → Storage, để PRIVATE.
--    Backend cấp signed URL có hạn khi frontend cần hiển thị ảnh.
create table card_attachments (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references cards(id) on delete cascade,
  name         text not null,                  -- tên file gốc người dùng upload
  mime_type    text not null,                  -- vd 'image/png', 'application/pdf'
  storage_path text not null,                  -- vd 'cards/<card_id>/<uuid>.png'
  size_bytes   bigint not null,
  is_image     boolean not null default false,
  is_cover     boolean not null default false, -- ảnh bìa hiện ngoài mặt thẻ
  uploaded_by  text not null references users(id),
  created_at   timestamptz not null default now()
);

create index idx_attachments_card on card_attachments (card_id);

-- Mỗi thẻ TỐI ĐA 1 ảnh bìa — DB tự chặn, không phụ thuộc code ứng dụng.
create unique index uniq_card_cover
  on card_attachments (card_id) where is_cover = true;


-- =============================================================================
-- 9. ACTIVITY LOG
-- =============================================================================
-- Vừa để hiển thị feed, vừa là NGUỒN cho thống kê "hoạt động gần nhất" của
-- từng thành viên (xem mục 12).

create table activity_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  board_id    uuid not null references boards(id) on delete cascade,
  -- Lọc audit trail theo đúng 1 thẻ. on delete set null: xoá thẻ vẫn giữ được
  -- lịch sử "ai đã xoá thẻ nào".
  card_id     uuid references cards(id) on delete set null,
  user_id     text not null references users(id),
  action_type text not null check (action_type in (
                'card_created', 'card_moved', 'card_updated',
                'card_deleted', 'card_assigned', 'comment_added')),
  target_id   uuid,                            -- id đối tượng liên quan (list/comment...)
  action_text text not null,                   -- "Nam đã chuyển thẻ 'Fix bug' sang Doing"
  created_at  timestamptz not null default now()
);

create index idx_activity_board on activity_logs (board_id, created_at desc);
create index idx_activity_card  on activity_logs (card_id);
create index idx_activity_user  on activity_logs (user_id, created_at desc);


-- =============================================================================
-- 10. MESSAGES — chat trong board (+ AI gợi ý tạo thẻ)
-- =============================================================================
-- AI đọc nội dung tin nhắn để phát hiện tin giao việc rồi GỢI Ý tạo thẻ —
-- người dùng phải bấm xác nhận mới thật sự tạo.

create table messages (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  board_id       uuid not null references boards(id) on delete cascade,
  user_id        text not null references users(id),   -- người gửi
  content        text not null,
  source_card_id uuid references cards(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index idx_messages_board on messages (board_id, created_at);


-- =============================================================================
-- 11. TUỲ CHỈNH CÁ NHÂN THEO BOARD (đồng bộ đa thiết bị)
-- =============================================================================
-- Dữ liệu RIÊNG TỪNG USER trên TỪNG BOARD → luôn có cả board_id + user_id.
-- Các trạng thái thuần cục bộ (thu gọn cột, Column/Row View, độ rộng khung chat)
-- CỐ Ý không đưa vào đây — chúng ở localStorage, xem schema.md mục 6.

create table board_saved_filters (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references boards(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  name         text not null,
  assignee_ids text[] not null default '{}',   -- có thể chứa '__UNASSIGNED__'
  label_ids    text[] not null default '{}',   -- có thể chứa '__NO_LABEL__'
  priorities   text[] not null default '{}',   -- 'low' | 'medium' | 'high'
  date_filter  text check (date_filter in ('overdue','today','week','no_due')),
  created_at   timestamptz not null default now()
);

create index idx_saved_filters on board_saved_filters (board_id, user_id);


-- Nhóm thẻ highlight chọn tay (Shift+click chọn nhiều thẻ rồi lưu thành chip).
-- Khác board_saved_filters: lưu THẲNG danh sách id thẻ, không theo điều kiện.
create table board_highlight_groups (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references boards(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  name       text not null,
  card_ids   uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_highlight_groups on board_highlight_groups (board_id, user_id);


-- =============================================================================
-- 12. VIEW THỐNG KÊ BOARD 📊
-- =============================================================================
-- NGUYÊN TẮC: thống kê là DỮ LIỆU SUY RA, không lưu sẵn.
--
-- Vì sao không tạo bảng `board_stats` rồi cộng/trừ mỗi lần thao tác?
--   → Chỉ cần 1 chỗ quên cập nhật (xoá thẻ, kéo-thả, đổi assignee...) là số liệu
--     sai vĩnh viễn, mà không có lỗi nào báo ra → rất khó phát hiện.
--   → Tính trực tiếp từ cards + activity_logs thì LUÔN khớp với màn hình.
--
-- ⚡ Khi nào cần bảng thống kê thật? Chỉ khi board có HÀNG CHỤC NGHÌN thẻ và view
--    chạy chậm. Lúc đó dùng materialized view + refresh định kỳ — vẫn KHÔNG nên
--    tự cộng trừ bằng tay trong code ứng dụng.


-- 12.1 — Tổng quan mỗi board (4 ô số liệu đầu modal "Thống kê & Báo cáo").
-- left join để board chưa có thẻ nào vẫn hiện 1 dòng số 0, không bị mất hút.
create or replace view board_stats_overview as
select
  b.id   as board_id,
  b.org_id,
  b.name as board_name,
  count(c.id)                                              as total_cards,
  count(c.id) filter (where c.completed_at is not null)     as completed_count,
  count(c.id) filter (where c.completed_at is null)         as in_progress_count,
  count(c.id) filter (where c.completed_at is null
                        and c.due_date < current_date)      as overdue_count,
  -- Tỷ lệ đúng hạn = (thẻ done trước/đúng hạn) / (thẻ done CÓ đặt hạn).
  -- nullif(...,0) để board chưa có thẻ done nào trả NULL thay vì lỗi chia 0.
  round(
    100.0 * count(c.id) filter (
      where c.completed_at is not null
        and c.due_date is not null
        and c.completed_at::date <= c.due_date
    )
    / nullif(count(c.id) filter (
      where c.completed_at is not null and c.due_date is not null), 0)
  )                                                        as on_time_rate_pct
from boards b
left join lists l on l.board_id = b.id
left join cards c on c.list_id = l.id
group by b.id, b.org_id, b.name;


-- 12.2 — Khối lượng công việc theo từng thành viên.
-- doing_count = chưa xong VÀ chưa quá hạn (thẻ không đặt hạn cũng tính đang làm).
-- 3 nhóm completed/doing/overdue không chồng lấn, cộng lại = assigned_count.
create or replace view board_member_workload as
select
  l.board_id,
  c.assignee_id                                            as user_id,
  u.display_name,
  count(*)                                                 as assigned_count,
  count(*) filter (where c.completed_at is not null)        as completed_count,
  count(*) filter (where c.completed_at is null
                     and (c.due_date is null
                          or c.due_date >= current_date))   as doing_count,
  count(*) filter (where c.completed_at is null
                     and c.due_date < current_date)         as overdue_count,
  -- Hoạt động gần nhất lấy từ activity_logs (nguồn sự thật "ai vừa làm gì").
  (select max(a.created_at) from activity_logs a
     where a.user_id = c.assignee_id and a.board_id = l.board_id) as last_active_at
from cards c
join lists l on l.id = c.list_id
join users u on u.id = c.assignee_id
where c.assignee_id is not null
group by l.board_id, c.assignee_id, u.display_name;


-- 12.3 — Danh sách thẻ quá hạn (ngăn kéo cảnh báo trong modal thống kê).
create or replace view board_overdue_cards as
select
  l.board_id,
  c.id            as card_id,
  c.title,
  c.assignee_id,
  u.display_name  as assignee_name,
  c.due_date,
  (current_date - c.due_date) as days_overdue
from cards c
join lists l on l.id = c.list_id
left join users u on u.id = c.assignee_id     -- left join: thẻ chưa gán ai vẫn hiện
where c.completed_at is null
  and c.due_date is not null
  and c.due_date < current_date
order by days_overdue desc;


-- =============================================================================
-- 13. SEED — dữ liệu mẫu để test (đã comment, KHÔNG chạy trên production)
-- =============================================================================
-- Bỏ dấu comment khối dưới để tạo: 2 user, 1 org, 1 workspace, 1 board, 3 cột,
-- 5 thẻ phủ đủ mọi trạng thái → đủ kiểm chứng cả 3 view thống kê ở mục 12.
--
-- Sau khi chạy, 3 câu select cuối phải ra đúng:
--   board_stats_overview  → 5 thẻ, 2 xong, 3 đang làm, 1 quá hạn, đúng hạn 50%
--   board_member_workload → Alpha 2 xong | Beta 1 đang làm + 1 quá hạn
--   board_overdue_cards   → 1 dòng "Tối ưu tốc độ tải trang", trễ 4 ngày
-- -----------------------------------------------------------------------------
/*
insert into users (id, email, display_name, username) values
  ('fb-alpha', 'alpha@test.dev', 'Nguyễn Văn Alpha', 'alpha'),
  ('fb-beta',  'beta@test.dev',  'Trần Thị Beta',    'beta');

insert into organizations (id, name, slug, owner_id) values
  ('11111111-1111-1111-1111-111111111111', 'Công ty Demo', 'cong-ty-demo', 'fb-alpha');

-- Beta để role 'admin' cho thấy vai trò uỷ quyền (tạo workspace/board, mời người)
insert into organization_members (org_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'fb-alpha', 'owner'),
  ('11111111-1111-1111-1111-111111111111', 'fb-beta',  'admin');

insert into workspaces (id, org_id, name, icon_bg, description, created_by) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Dự án Website', 'bg-board-purple', 'Workspace mẫu để test', 'fb-alpha');

insert into workspace_members (workspace_id, user_id, role) values
  ('22222222-2222-2222-2222-222222222222', 'fb-alpha', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'fb-beta',  'member');

insert into boards (id, org_id, workspace_id, name, visibility, background, created_by) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'Sprint 1', 'workspace', 'bg-board-blue', 'fb-alpha');

insert into board_stars (board_id, user_id) values
  ('33333333-3333-3333-3333-333333333333', 'fb-alpha');

insert into lists (id, org_id, board_id, name, position) values
  ('44444444-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Việc cần làm', 1),
  ('44444444-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Đang làm',     2),
  ('44444444-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Hoàn thành',   3);

insert into cards (org_id, list_id, title, assignee_id, due_date, priority, completed_at, position, created_by) values
  -- 1. Xong ĐÚNG hạn
  ('11111111-1111-1111-1111-111111111111', '44444444-0000-0000-0000-000000000003',
   'Thiết kế giao diện trang chủ', 'fb-alpha', current_date - 2, 'high',
   (current_date - 3)::timestamptz, 1, 'fb-alpha'),
  -- 2. Xong TRỄ hạn → kéo tỷ lệ đúng hạn xuống 50%
  ('11111111-1111-1111-1111-111111111111', '44444444-0000-0000-0000-000000000003',
   'Viết API đăng nhập', 'fb-alpha', current_date - 5, 'medium',
   (current_date - 1)::timestamptz, 2, 'fb-alpha'),
  -- 3. QUÁ HẠN, chưa xong
  ('11111111-1111-1111-1111-111111111111', '44444444-0000-0000-0000-000000000002',
   'Tối ưu tốc độ tải trang', 'fb-beta', current_date - 4, 'high', null, 1, 'fb-alpha'),
  -- 4. Đang làm, còn hạn
  ('11111111-1111-1111-1111-111111111111', '44444444-0000-0000-0000-000000000002',
   'Kiểm thử trên mobile', 'fb-beta', current_date + 7, 'low', null, 2, 'fb-alpha'),
  -- 5. Chưa gán ai → không xuất hiện ở board_member_workload
  ('11111111-1111-1111-1111-111111111111', '44444444-0000-0000-0000-000000000001',
   'Chuẩn bị tài liệu bàn giao', null, null, 'medium', null, 1, 'fb-alpha');

insert into labels (id, org_id, board_id, name, color) values
  ('55555555-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Bug', '#ef4444'),
  ('55555555-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Tính năng', '#61bd4f');

insert into activity_logs (org_id, board_id, user_id, action_type, action_text, created_at) values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   'fb-alpha', 'card_created', 'Alpha đã tạo thẻ "Thiết kế giao diện trang chủ"', now() - interval '3 days'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   'fb-beta',  'card_moved',   'Beta đã chuyển thẻ "Tối ưu tốc độ tải trang" sang Đang làm', now() - interval '1 day');

select * from board_stats_overview;
select * from board_member_workload order by display_name;
select * from board_overdue_cards;
*/
