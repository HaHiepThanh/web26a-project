-- =====================================================================
-- 0008 — Link Google Meet gắn theo board
-- =====================================================================
--
-- CÁCH CHẠY: mở Supabase → SQL Editor → dán toàn bộ file này → Run.
-- Chạy lại nhiều lần không sao (có IF NOT EXISTS).
--
-- VÌ SAO LƯU LINK Ở BOARD, KHÔNG TẠO MỚI MỖI LẦN BẤM
--
--   Yêu cầu là "ai bấm cũng vào CÙNG một cuộc họp". Nếu nút tự tạo phòng mỗi
--   lần bấm thì năm người bấm là năm phòng riêng, không ai gặp ai — đúng thứ
--   tính năng này sinh ra để tránh. Nên chủ board tạo MỘT lần, link nằm ở đây,
--   những người sau chỉ mở lại đúng link đó.
--
-- VÌ SAO KHÔNG LƯU TOKEN GOOGLE Ở ĐÂY (và ở bất cứ đâu)
--
--   Cuộc họp được tạo NGAY TRONG TRÌNH DUYỆT của chủ board, bằng access token
--   mà Firebase trả về sau popup đăng nhập Google. Token đó sống khoảng một
--   giờ và Firebase KHÔNG cấp refresh token, nên nó chỉ nằm trong bộ nhớ tab
--   rồi biến mất.
--
--   Muốn khỏi popup mỗi lần thì phải chạy luồng OAuth riêng phía server và cất
--   refresh token của tài khoản Google người dùng — một bí mật dài hạn, mở
--   được lịch và (tuỳ scope) hộp thư của họ. Cất nó đòi mã hoá khi nghỉ, xoay
--   vòng khoá, đường thu hồi, và một chỗ rò là rò tài khoản Google thật của
--   người dùng. Đổi lấy việc bớt một cú popup — không đáng.
--
--   Hệ quả: server này KHÔNG BAO GIỜ thấy token Google. Nó chỉ nhận đúng một
--   chuỗi URL đã tạo xong.
-- =====================================================================

ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS meet_url        text,
  ADD COLUMN IF NOT EXISTS meet_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS meet_created_by text REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN boards.meet_url IS
  'Link Google Meet dùng chung cho board. NULL = chưa ai tạo. Tạo bằng Calendar API ngay trên trình duyệt của chủ board; server không giữ token Google nào.';
COMMENT ON COLUMN boards.meet_created_by IS
  'Ai đã tạo cuộc họp. ON DELETE SET NULL: xoá tài khoản thì link vẫn còn dùng được, chỉ mất thông tin người tạo.';

-- ---------------------------------------------------------------------
-- Kiểm tra lại: phải thấy đủ 3 cột.
-- ---------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'boards' AND column_name LIKE 'meet%'
ORDER BY column_name;
