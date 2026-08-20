-- =============================================================================
-- SEED DỮ LIỆU TEST — để 3 bạn không phải ngồi chờ nhau
-- =============================================================================
-- Hoà cần workspace mới tạo được board; Hoàng cần list mới tạo được thẻ.
-- File này tạo sẵn cả chuỗi đó, ai cũng bắt tay vào phần mình được ngay.
--
-- CÁCH CHẠY: Supabase → SQL Editor → New query → dán cả file → Run.
--
-- ⚠️ CHỈ CẦN SỬA 1 DÒNG: email ở ngay bên dưới.
--
-- ⚠️ TRƯỚC KHI CHẠY: phải đăng nhập ít nhất 1 lần qua Postman
--    (thư mục "0. BAT DAU O DAY" → Dang nhap), rồi gọi GET /auth/me.
--    Lúc đó backend mới tạo dòng của bạn trong bảng `users`.
--    Chưa làm bước này thì script sẽ báo lỗi có hướng dẫn rõ ràng.
--
-- Chạy lại nhiều lần được: dữ liệu seed cũ của CHÍNH BẠN bị xoá rồi tạo lại.
-- 3 bạn dùng chung 1 project Supabase cũng không đạp lên nhau — mỗi người có
-- một tổ chức seed riêng, đặt theo email.
-- =============================================================================

do $$
declare
  -- >>>>>>>>>>>>>>  SỬA ĐÚNG DÒNG NÀY  <<<<<<<<<<<<<<
  my_email  text := 'hocvien-a@test.dev';

  my_uid    text;
  my_slug   text;
  org_id    uuid;
  ws_id     uuid;
  board_id  uuid;
  list1_id  uuid;
  list2_id  uuid;
  list3_id  uuid;
begin
  -- 1. Tìm uid từ email ------------------------------------------------------
  select id into my_uid from users where email = my_email;

  if my_uid is null then
    raise exception
      E'Không tìm thấy user có email "%" trong bảng users.\n'
      '   → Mở Postman, chạy "0. BAT DAU O DAY" → Dang nhap,\n'
      '     rồi chạy "1. Auth" → GET /auth/me một lần.\n'
      '     Sau đó chạy lại file này.', my_email;
  end if;

  -- slug riêng cho từng người, để 3 bạn không đạp lên nhau
  my_slug := 'seed-' || lower(regexp_replace(split_part(my_email, '@', 1), '[^a-zA-Z0-9]', '-', 'g'));

  -- 2. Xoá dữ liệu seed cũ của chính mình -----------------------------------
  -- cascade sẽ dọn sạch workspace/board/list/card/label bên trong
  delete from organizations where slug = my_slug;

  -- 3. Tổ chức ---------------------------------------------------------------
  insert into organizations (name, slug, owner_id)
  values ('Tổ chức Seed', my_slug, my_uid)
  returning id into org_id;

  insert into organization_members (org_id, user_id, role)
  values (org_id, my_uid, 'owner');

  -- 4. Workspace -------------------------------------------------------------
  insert into workspaces (org_id, name, description, created_by)
  values (org_id, 'Workspace Seed', 'Dữ liệu mẫu để test bằng Postman', my_uid)
  returning id into ws_id;

  insert into workspace_members (workspace_id, user_id, role)
  values (ws_id, my_uid, 'owner');

  -- 5. Board -----------------------------------------------------------------
  insert into boards (org_id, workspace_id, name, visibility, background, created_by)
  values (org_id, ws_id, 'Board Seed', 'workspace', 'bg-board-blue', my_uid)
  returning id into board_id;

  -- 6. Ba cột ----------------------------------------------------------------
  insert into lists (org_id, board_id, name, position)
  values (org_id, board_id, 'Việc cần làm', 1) returning id into list1_id;

  insert into lists (org_id, board_id, name, position)
  values (org_id, board_id, 'Đang làm', 2) returning id into list2_id;

  insert into lists (org_id, board_id, name, position)
  values (org_id, board_id, 'Hoàn thành', 3) returning id into list3_id;

  -- 7. Vài thẻ (đủ 3 mức ưu tiên để test bộ lọc) -----------------------------
  insert into cards (org_id, list_id, title, description, position, priority, created_by) values
    (org_id, list1_id, 'Viết API đăng nhập',  'Thẻ mẫu', 1, 'high',   my_uid),
    (org_id, list1_id, 'Thiết kế giao diện',  'Thẻ mẫu', 2, 'medium', my_uid),
    (org_id, list2_id, 'Kiểm thử API',        'Thẻ mẫu', 1, 'low',    my_uid);

  -- 8. Hai nhãn --------------------------------------------------------------
  insert into labels (org_id, board_id, name, color) values
    (org_id, board_id, 'Gấp',     '#ef4444'),
    (org_id, board_id, 'Backend', '#3b82f6');

  raise notice 'Seed xong cho % (slug: %)', my_email, my_slug;
end $$;


-- =============================================================================
-- ID để dán vào Postman
-- =============================================================================
-- Environment → sửa giá trị các biến tương ứng (orgId, workspaceId, boardId,
-- listId, cardId, labelId).
--
-- Câu này tự tìm tổ chức seed VỪA TẠO GẦN NHẤT, không cần sửa gì.
-- (Chạy cả file một lượt thì luôn đúng. Nếu 3 bạn dùng chung project Supabase
--  và bạn chỉ chạy riêng đoạn này sau khi người khác vừa seed, nó sẽ ra id của
--  người đó — cứ chạy lại cả file cho chắc.)
-- =============================================================================

with seed_org as (
  select id from organizations
  where slug like 'seed-%'
  order by created_at desc
  limit 1
)
select 'orgId' as bien, (select id from seed_org)::text as gia_tri
union all
select 'workspaceId', (select id::text from workspaces
                       where org_id = (select id from seed_org) limit 1)
union all
select 'boardId',     (select id::text from boards
                       where org_id = (select id from seed_org) limit 1)
union all
select 'listId',      (select id::text from lists
                       where org_id = (select id from seed_org)
                       order by position limit 1)
union all
select 'cardId',      (select id::text from cards
                       where org_id = (select id from seed_org)
                       order by position limit 1)
union all
select 'labelId',     (select id::text from labels
                       where org_id = (select id from seed_org) limit 1);
