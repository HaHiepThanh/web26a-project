-- =====================================================================
-- 0006 — Gộp assertBoardAccess / assertCardAccess thành RPC
-- =====================================================================
--
-- CÁCH CHẠY: mở Supabase → SQL Editor → dán toàn bộ file này → Run.
-- Chạy lại nhiều lần không sao (CREATE OR REPLACE).
--
-- LÝ DO: `AccessService.assertBoardAccess` hiện chạy 4 truy vấn NỐI TIẾP
-- (board → organization_members → workspaces → workspace_members/board_members),
-- và nó chạy ở MỌI endpoint đụng tới board. Đo trên máy dev: một vòng gọi
-- Supabase ~94ms, nên riêng hàm này đã tốn ~280-370ms trước khi lấy được một
-- byte dữ liệu thật nào.
--
-- Gộp 4 truy vấn vào 1 hàm chạy TRONG Postgres: 4 phép JOIN đó tốn dưới 1ms ở
-- đó, và ứng dụng chỉ còn đi ĐÚNG MỘT chuyến khứ hồi qua mạng.
--
-- ⚠️ Hành vi phải giống HỆT `access.service.ts` — đây không phải viết lại
-- logic, chỉ chuyển chỗ chạy. Đối chiếu từng dòng với AccessService trước khi
-- CHANGE bất cứ điều kiện nào ở đây.
-- =====================================================================

-- ---------------------------------------------------------------------
-- kiem_tra_quyen_board(uid, board_id)
--
-- Trả về allowed=false cho MỌI trường hợp không có quyền — không phân biệt
-- "board không tồn tại" với "có tồn tại nhưng không phải thành viên". Đây là
-- điều CỐ Ý: giữ nguyên quy ước 404 (không phải 403) của bản gốc, để không
-- vô tình xác nhận "id này có thật" cho người dò uuid.
--
-- Tên cột ra RETURNS TABLE có tiền tố `out_` để không trùng tên với cột thật
-- của bảng — nếu trùng, PL/pgSQL có thể đọc nhầm biến OUT thay vì cột trong
-- câu SELECT, một lỗi rất khó phát hiện khi test.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kiem_tra_quyen_board(p_uid text, p_board_id text)
RETURNS TABLE (
  allowed          boolean,
  out_board_id     uuid,
  out_org_id       uuid,
  out_workspace_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_board_id uuid;
  v_board    RECORD;
  v_role     text;
  v_ws_vis   text;
  v_la_tv    boolean;
BEGIN
  -- id sai định dạng uuid → coi như không tìm thấy, KHÔNG ném lỗi ra ngoài.
  -- Giống hệt cách access.service.ts bắt mã lỗi 22P02 của Postgres.
  BEGIN
    v_board_id := p_board_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END;

  SELECT b.id, b.org_id, b.workspace_id, b.visibility
    INTO v_board
    FROM boards b
    WHERE b.id = v_board_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- Tầng 1: thuộc tổ chức chứa board này không.
  SELECT om.role INTO v_role
    FROM organization_members om
    WHERE om.org_id = v_board.org_id AND om.user_id = p_uid;

  IF v_role IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- Tầng 2: workspace 'restricted' thì phải có tên trong workspace_members.
  SELECT w.visibility INTO v_ws_vis
    FROM workspaces w WHERE w.id = v_board.workspace_id;

  IF v_ws_vis = 'restricted' THEN
    SELECT EXISTS(
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = v_board.workspace_id AND wm.user_id = p_uid
    ) INTO v_la_tv;

    IF NOT v_la_tv THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  END IF;

  -- Tầng 3: board 'private' thì phải có tên trong board_members.
  IF v_board.visibility = 'private' THEN
    SELECT EXISTS(
      SELECT 1 FROM board_members bm
      WHERE bm.board_id = v_board.id AND bm.user_id = p_uid
    ) INTO v_la_tv;

    IF NOT v_la_tv THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, v_board.id, v_board.org_id, v_board.workspace_id;
END;
$$;

-- ---------------------------------------------------------------------
-- kiem_tra_quyen_the(uid, card_id)
--
-- `cards` không có board_id — phải đi qua `lists` để tìm. Gọi lại
-- kiem_tra_quyen_board() ngay TRONG Postgres (không phải một chuyến khứ hồi
-- mới từ Node) để ăn đủ ba tầng ở trên mà không lặp lại logic.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kiem_tra_quyen_the(p_uid text, p_card_id text)
RETURNS TABLE (
  allowed       boolean,
  out_card_id   uuid,
  out_board_id  uuid,
  out_org_id    uuid,
  out_title     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_id uuid;
  v_card    RECORD;
  v_check   RECORD;
BEGIN
  BEGIN
    v_card_id := p_card_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END;

  SELECT c.id, c.org_id, c.title, l.board_id
    INTO v_card
    FROM cards c
    JOIN lists l ON l.id = c.list_id
    WHERE c.id = v_card_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_check FROM kiem_tra_quyen_board(p_uid, v_card.board_id::text);

  IF NOT v_check.allowed THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_card.id, v_card.board_id, v_card.org_id, v_card.title;
END;
$$;

-- ---------------------------------------------------------------------
-- SECURITY DEFINER chạy bằng quyền của người TẠO hàm (thường là postgres),
-- không phải quyền của người gọi. Ở đây không sao vì backend đã dùng
-- service_role — RLS vốn đã bị bỏ qua sẵn cho mọi truy vấn từ backend, hàm
-- này không mở thêm quyền nào mới. Nhưng để chắc chắn PostgREST không cho ai
-- khác gọi thẳng ngoài ý muốn, chỉ cấp quyền EXECUTE cho hai vai trò dùng
-- API: service_role (backend) và authenticated (phòng khi sau này có nơi
-- gọi RPC thẳng qua Supabase client ở phía có đăng nhập).
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION kiem_tra_quyen_board(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION kiem_tra_quyen_the(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kiem_tra_quyen_board(text, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION kiem_tra_quyen_the(text, text) TO service_role, authenticated;

-- ---------------------------------------------------------------------
-- Kiểm tra lại: 2 lệnh dưới phải chạy được và trả về allowed = false
-- (uid rác, board không tồn tại).
-- ---------------------------------------------------------------------
SELECT * FROM kiem_tra_quyen_board('khong-ton-tai', '00000000-0000-0000-0000-000000000000');
SELECT * FROM kiem_tra_quyen_the('khong-ton-tai', '00000000-0000-0000-0000-000000000000');
