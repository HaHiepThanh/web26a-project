-- =====================================================================
-- 0010 — Lịch họp lặp lại
-- =====================================================================
--
-- CÁCH CHẠY: Supabase → SQL Editor → dán toàn bộ file → Run.
-- Chạy lại nhiều lần không sao.
--
-- VÌ SAO LƯU QUY TẮC MÀ VẪN TẠO MỖI LẦN MỘT DÒNG
--
--   Bộ nhắc của app (MeetingReminderService) đặt hẹn giờ theo `start_at` —
--   một mốc thời gian CỤ THỂ. Nó không biết đọc quy tắc lặp. Nếu chỉ lưu một
--   dòng kèm "mỗi thứ Hai" thì chuông chỉ kêu đúng tuần đầu rồi im mãi.
--
--   Nên mỗi lần diễn ra là một dòng riêng — chuông và truy vấn `my-upcoming`
--   không phải biết gì về chuyện lặp.
--
--   Cột `recurrence` dưới đây chỉ để GHI NHỚ quy tắc gốc, phục vụ hai việc:
--     • xuất lại ra .ics đúng một dòng RRULE cho cả chuỗi (không phải N sự
--       kiện rời rạc mà người dùng phải xoá từng cái)
--     • hiển thị "Every week, 12 times" cho người đọc
--
--   Chỉ dòng ĐẦU của chuỗi mang giá trị này; những dòng sau để NULL.
-- =====================================================================

ALTER TABLE board_meetings
  ADD COLUMN IF NOT EXISTS recurrence text;

COMMENT ON COLUMN board_meetings.recurrence IS
  'Quy tắc lặp dạng RRULE (RFC 5545), ví dụ FREQ=WEEKLY;COUNT=12. Chỉ dòng ĐẦU của chuỗi có giá trị; các lần diễn ra sau để NULL. Mỗi lần diễn ra vẫn là một dòng riêng vì bộ nhắc chỉ hiểu mốc thời gian cụ thể.';

-- ---------------------------------------------------------------------
-- Kiểm tra lại
-- ---------------------------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'board_meetings' AND column_name = 'recurrence';
