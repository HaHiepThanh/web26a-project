-- =====================================================================
-- 0004 — Gợi ý tạo thẻ do AI phát hiện từ tin nhắn chat
-- =====================================================================
--
-- CÁCH CHẠY: mở Supabase → SQL Editor → dán toàn bộ file này → Run.
-- Chạy lại nhiều lần không sao (đều có IF NOT EXISTS).
--
-- Mỗi tin nhắn chat đi qua bộ lọc sẽ được Gemini phân tích. Nếu nó là một câu
-- giao việc, backend lưu đề xuất vào bảng này rồi phát cho mọi người đang mở
-- board. Người dùng bấm xem, sửa lại, rồi mới tạo thẻ thật.
--
-- ── Vì sao PHẢI lưu xuống database, không để tạm trong bộ nhớ?
--
--   1. F5 là mất. Gợi ý sống vài giây rồi biến mất thì gần như vô dụng.
--   2. Người được giao việc có thể đang offline lúc tin nhắn tới — vào sau vẫn
--      phải thấy.
--   3. QUAN TRỌNG NHẤT: cột `status` chặn việc tạo thẻ trùng. Không có nó, Huy
--      và Hoà cùng bấm "Chấp nhận" là ra HAI bộ thẻ giống hệt nhau.
-- =====================================================================

CREATE TABLE IF NOT EXISTS chat_task_suggestions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  board_id    uuid NOT NULL REFERENCES boards(id)        ON DELETE CASCADE,
  message_id  uuid NOT NULL REFERENCES messages(id)      ON DELETE CASCADE,

  -- Người GỬI tin nhắn gốc (không phải người bấm chấp nhận).
  created_by  text NOT NULL REFERENCES users(id),

  status      text NOT NULL DEFAULT 'pending',

  -- Danh sách thẻ Gemini đề xuất, dạng
  --   [{ title, description, assigneeId, dueDate, listId, priority }, ...]
  --
  -- Để jsonb chứ không tách bảng con: đây là BẢN NHÁP người dùng sẽ sửa lại
  -- trong modal, chưa phải thực thể thật. Tách bảng chỉ tổ phải đi dọn mỗi khi
  -- gợi ý bị bỏ qua.
  cards       jsonb NOT NULL,

  -- Model đã dùng — để sau này đổi model còn đối chiếu được chất lượng.
  model       text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text REFERENCES users(id),

  CONSTRAINT chat_task_suggestions_status_check
    CHECK (status IN ('pending', 'accepted', 'dismissed'))
);

-- Một tin nhắn chỉ đẻ ra đúng MỘT gợi ý. Ràng buộc này cũng là lưới an toàn cho
-- trường hợp cùng một tin bị đưa đi phân tích hai lần (vd server khởi động lại
-- giữa chừng): lần thứ hai vỡ vì trùng khoá, không tạo thêm bản ghi.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_suggestion_per_message
  ON chat_task_suggestions (message_id);

-- Truy vấn nóng nhất: "board này còn gợi ý nào đang chờ không?" — chạy mỗi lần
-- mở board.
CREATE INDEX IF NOT EXISTS idx_suggestions_board_status
  ON chat_task_suggestions (board_id, status);

-- --------------------------------------------------------------------
-- Kiểm tra lại: câu dưới phải trả ra đúng các cột vừa tạo.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'chat_task_suggestions'
ORDER BY ordinal_position;
