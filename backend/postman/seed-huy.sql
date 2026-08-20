-- Sinh ra từ seed-du-lieu-test.sql. Sửa logic thì sửa file gốc rồi tạo lại 3 file này.
-- =============================================================================
-- SEED DỮ LIỆU TEST — DÀNH RIÊNG CHO HUY
-- =============================================================================
-- Hoà cần workspace mới tạo được board; Hoàng cần list mới tạo được thẻ.
-- File này tạo sẵn cả chuỗi đó, ai cũng bắt tay vào phần mình được ngay.
--
-- CÁCH CHẠY: Supabase → SQL Editor → New query → dán cả file → Run.
--
-- ✅ FILE NÀY DÀNH RIÊNG CHO HUY — KHÔNG CẦN SỬA GÌ, dán vào là chạy.
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
  -- email test của Huy — đã điền sẵn, đừng đổi
  my_email  text := 'hocvien-a@test.dev';

  my_uid      text;
  slug_owner  text;
  my_slug     text;
  org_id      uuid;
  ws_id       uuid;
  board_id    uuid;
  list1_id    uuid;
  list2_id    uuid;
  list3_id    uuid;

  -- "Người lạ" + tổ chức của họ — để test phân quyền và bảo mật mà KHÔNG cần
  -- rủ bạn khác vào cùng test. Xem phần 9 và 10 ở cuối.
  other_uid   text;
  other_slug  text;
  other_org   uuid;
  other_ws    uuid;
  other_board uuid;
  other_list  uuid;
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
  -- Cắt còn tối đa 20 ký tự và bỏ gạch ngang thừa ở cuối: cột slug giới hạn
  -- 30 ký tự và cấm kết thúc bằng gạch ngang, còn chỗ cho hậu tố '-nguoi-la'.
  my_slug := rtrim(left('seed-' || lower(regexp_replace(
               split_part(my_email, '@', 1), '[^a-zA-Z0-9]', '-', 'g')), 20), '-');
  other_slug := my_slug || '-khac';
  other_uid  := 'nguoi-la-' || my_slug;

  -- Mọi id đều TÍNH TỪ EMAIL chứ không random. Nhờ vậy chạy lại bao nhiêu lần
  -- cũng ra đúng những id cũ, và thầy điền sẵn được vào file Postman của bạn —
  -- bạn không phải copy dán uuid nào cả.
  org_id      := md5('org:'   || my_email)::uuid;
  ws_id       := md5('ws:'    || my_email)::uuid;
  board_id    := md5('board:' || my_email)::uuid;
  list1_id    := md5('list1:' || my_email)::uuid;
  list2_id    := md5('list2:' || my_email)::uuid;
  list3_id    := md5('list3:' || my_email)::uuid;
  other_org   := md5('xorg:'  || my_email)::uuid;
  other_ws    := md5('xws:'   || my_email)::uuid;
  other_board := md5('xboard:'|| my_email)::uuid;
  other_list  := md5('xlist:' || my_email)::uuid;

  -- 2. Xoá dữ liệu seed cũ của CHÍNH MÌNH ------------------------------------
  -- ⚠️ Kiểm tra chủ sở hữu TRƯỚC KHI XOÁ. Hai người đặt testEmail khác domain
  --    nhưng cùng tên (huy@gmail.com và huy@test.dev) sẽ ra cùng một slug —
  --    không có đoạn này thì người chạy sau xoá sạch dữ liệu người chạy trước
  --    mà không báo gì.
  select owner_id into slug_owner from organizations where slug = my_slug;

  if slug_owner is not null and slug_owner <> my_uid then
    raise exception
      E'Tổ chức seed "%" đang thuộc về người khác (uid: %).\n'
      '   Bạn và bạn đó đang dùng testEmail có phần trước dấu @ giống nhau.\n'
      '   → Mở Postman: Environments → web26a - Local → đổi testEmail\n'
      '     thành tên khác hẳn (vd huy@test.dev / hoa@test.dev / hoang@test.dev),\n'
      '     chạy lại "Dang ky tai khoan test" + "Dang nhap" + GET /auth/me,\n'
      '     rồi chạy lại file này.\n'
      '   KHÔNG có dữ liệu nào bị xoá.', my_slug, slug_owner;
  end if;

  -- cascade sẽ dọn sạch workspace/board/list/card/label bên trong
  delete from organizations where slug in (my_slug, other_slug);
  delete from users where id = other_uid;

  -- 3. Tổ chức ---------------------------------------------------------------
  insert into organizations (id, name, slug, owner_id)
  values (org_id, 'Tổ chức Seed', my_slug, my_uid);

  insert into organization_members (org_id, user_id, role)
  values (org_id, my_uid, 'owner');

  -- 4. Workspace -------------------------------------------------------------
  insert into workspaces (id, org_id, name, description, created_by)
  values (ws_id, org_id, 'Workspace Seed', 'Dữ liệu mẫu để test bằng Postman', my_uid);

  insert into workspace_members (workspace_id, user_id, role)
  values (ws_id, my_uid, 'owner');

  -- 5. Board -----------------------------------------------------------------
  insert into boards (id, org_id, workspace_id, name, visibility, background, created_by)
  values (board_id, org_id, ws_id, 'Board Seed', 'workspace', 'bg-board-blue', my_uid);

  -- 6. Ba cột ----------------------------------------------------------------
  insert into lists (id, org_id, board_id, name, position) values
    (list1_id, org_id, board_id, 'Việc cần làm', 1),
    (list2_id, org_id, board_id, 'Đang làm',     2),
    (list3_id, org_id, board_id, 'Hoàn thành',   3);

  -- 7. Vài thẻ (đủ 3 mức ưu tiên để test bộ lọc) -----------------------------
  insert into cards (id, org_id, list_id, title, description, position, priority, created_by) values
    (md5('card1:' || my_email)::uuid, org_id, list1_id, 'Viết API đăng nhập', 'Thẻ mẫu', 1, 'high',   my_uid),
    (md5('card2:' || my_email)::uuid, org_id, list1_id, 'Thiết kế giao diện', 'Thẻ mẫu', 2, 'medium', my_uid),
    (md5('card3:' || my_email)::uuid, org_id, list2_id, 'Kiểm thử API',       'Thẻ mẫu', 1, 'low',    my_uid);

  -- 8. Hai nhãn --------------------------------------------------------------
  insert into labels (id, org_id, board_id, name, color) values
    (md5('label1:' || my_email)::uuid, org_id, board_id, 'Gấp',     '#ef4444'),
    (md5('label2:' || my_email)::uuid, org_id, board_id, 'Backend', '#3b82f6');

  -- 9. "Người lạ" — thành viên thường trong TỔ CHỨC CỦA BẠN ------------------
  -- Để Huy test được ngay: mời người, đổi vai trò, xoá thành viên — mà không
  -- phải chờ bạn nào đăng ký tài khoản thật.
  -- ⚠️ Người này KHÔNG đăng nhập được (không có tài khoản Firebase), nên không
  --    dùng để test "member gọi API bị 403" — cái đó vẫn cần tài khoản thật.
  insert into users (id, email, display_name, username)
  values (other_uid, 'nguoi-la-' || my_slug || '@test.dev', 'Người Lạ', other_uid);

  insert into organization_members (org_id, user_id, role)
  values (org_id, other_uid, 'member');

  -- 10. TỔ CHỨC KHÁC mà bạn KHÔNG thuộc về ------------------------------------
  -- Dùng để tự kiểm tra bảo mật: gọi endpoint của mình với id bên dưới thì
  -- PHẢI bị chặn (403 hoặc 404), tuyệt đối không được trả dữ liệu ra.
  insert into organizations (id, name, slug, owner_id)
  values (other_org, 'Tổ chức Người Lạ', other_slug, other_uid);

  insert into organization_members (org_id, user_id, role)
  values (other_org, other_uid, 'owner');

  insert into workspaces (id, org_id, name, description, created_by)
  values (other_ws, other_org, 'Workspace Người Lạ', 'KHONG duoc phep truy cap', other_uid);

  insert into boards (id, org_id, workspace_id, name, visibility, background, created_by)
  values (other_board, other_org, other_ws, 'Board Người Lạ', 'workspace', 'bg-board-red', other_uid);

  insert into lists (id, org_id, board_id, name, position)
  values (other_list, other_org, other_board, 'Cột Người Lạ', 1);

  insert into cards (id, org_id, list_id, title, description, position, priority, created_by)
  values (md5('xcard:' || my_email)::uuid, other_org, other_list,
          'Thẻ bí mật của người khác', 'KHONG duoc phep doc', 1, 'high', other_uid);

  raise notice 'Seed xong cho % (slug: %, tổ chức lạ: %)', my_email, my_slug, other_slug;
end $$;


-- =============================================================================
-- BẢNG ID — chỉ để XEM CHO BIẾT, KHÔNG PHẢI COPY
-- =============================================================================
-- Thầy đã điền sẵn toàn bộ id này vào file environment Postman của bạn rồi.
-- Chạy xong seed là dùng Postman được ngay, không phải dán gì cả.
-- Bảng dưới chỉ để đối chiếu khi nghi ngờ Postman đang trỏ sai chỗ.
--
-- Câu này tự tìm tổ chức seed VỪA TẠO GẦN NHẤT, không cần sửa gì.
-- (Chạy cả file một lượt thì luôn đúng. Nếu 3 bạn dùng chung project Supabase
--  và bạn chỉ chạy riêng đoạn này sau khi người khác vừa seed, nó sẽ ra id của
--  người đó — cứ chạy lại cả file cho chắc.)
-- =============================================================================

with seed_org as (
  select id, slug from organizations
  where slug like 'seed-%' and slug not like '%-khac'
  order by created_at desc
  limit 1
),
org_khac as (
  select id from organizations
  where slug = (select slug from seed_org) || '-khac'
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
                       where org_id = (select id from seed_org) limit 1)
-- Hai dòng dưới dùng cho phần KIỂM TRA BẢO MẬT: gọi endpoint của bạn với 2 id
-- này thì PHẢI bị chặn (403 hoặc 404), không được trả dữ liệu ra.
union all
select 'memberUserId', (select user_id from organization_members
                        where org_id = (select id from seed_org) and role = 'member' limit 1)
union all
select 'orgIdNguoiLa', (select id::text from org_khac);
