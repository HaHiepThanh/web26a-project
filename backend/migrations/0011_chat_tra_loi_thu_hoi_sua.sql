-- =====================================================================
-- 0011 — Chat: trả lời, thu hồi, chỉnh sửa
-- =====================================================================
--
-- CÁCH CHẠY: Supabase → SQL Editor → dán toàn bộ file → Run.
-- Chạy lại nhiều lần không sao.
--
-- GỘP BA VIỆC VÀO MỘT MIGRATION vì cả ba đều chỉ thêm cột vào `messages`.
-- Tách ba lần là ba lần phải nhớ vào Supabase dán tay.
--
-- VÌ SAO `on delete set null` CHỨ KHÔNG PHẢI `cascade`
--
--   `cascade` nghĩa là xoá một tin thì mọi câu trả lời cho nó biến mất theo.
--   Đó là dữ liệu của NGƯỜI KHÁC. Một người xoá tin của mình không được phép
--   xoá câu trả lời của đồng đội.
--
-- VÌ SAO THU HỒI KHÔNG XOÁ DÒNG
--
--   Xoá dòng thì `reply_to_id` của mọi câu trả lời thành NULL, và ô trích dẫn
--   mất sạch ngữ cảnh. Giữ dòng lại, đánh dấu `deleted_at`, thì ô trích dẫn
--   vẫn hiện được "Tin nhắn đã được thu hồi".
--
--   ⚠️ Nội dung vẫn nằm trong database. Backend có nhiệm vụ KHÔNG trả `content`
--      khi `deleted_at` khác NULL — xem `chat.service.ts`.
-- =====================================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at   timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

COMMENT ON COLUMN messages.reply_to_id IS
  'Tin nhắn mà tin này trả lời. ON DELETE SET NULL: xoá tin gốc không được kéo theo câu trả lời của người khác.';
COMMENT ON COLUMN messages.edited_at IS
  'Lần sửa gần nhất. NULL = chưa từng sửa. UI hiện "đã chỉnh sửa" cạnh giờ.';
COMMENT ON COLUMN messages.deleted_at IS
  'Thời điểm thu hồi. Dòng vẫn giữ để ô trích dẫn còn chỗ bám; backend KHÔNG trả content khi cột này khác NULL.';

-- Chỉ cần cho khoá ngoại: Postgres quét bảng con mỗi lần xoá tin gốc nếu thiếu.
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages (reply_to_id);

-- ---------------------------------------------------------------------
-- Kiểm tra lại
-- ---------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'messages'
  AND column_name IN ('reply_to_id', 'edited_at', 'deleted_at')
ORDER BY column_name;
