-- =====================================================================
-- 0007 — Trạng thái tour hướng dẫn người dùng mới
-- =====================================================================
--
-- CÁCH CHẠY: mở Supabase → SQL Editor → dán toàn bộ file này → Run.
-- Chạy lại nhiều lần không sao (có IF NOT EXISTS).
--
-- Vì sao lưu ở DB chứ không localStorage?
--
--   "Người này đã được hướng dẫn rồi" là sự thật của TÀI KHOẢN, không phải của
--   CÁI MÁY. Để ở localStorage thì đổi máy, đổi trình duyệt, hay mở cửa sổ ẩn
--   danh là app lại chào hỏi một người đã dùng ba tháng — trông như phần mềm bị
--   mất trí nhớ. App đang có nếp lưu `trello_theme` / `trello_chat_panel_width`
--   ở localStorage, nhưng hai thứ đó đúng là tuỳ chọn của máy nên hợp lý.
--
-- Vì sao `jsonb` chứ không `boolean tour_done`?
--
--   Một cờ bật/tắt chỉ trả lời được đúng một câu hỏi. Còn cần chứa:
--     - đang dở ở bước nào  → lần sau mở lại hỏi "Resume from step 3?"
--     - coach mark nào đã hiện → mỗi cái chỉ được hiện đúng MỘT lần
--     - đã chào bao nhiêu phiên → dùng cho luật giảm dần tiếng nói
--   Thêm tính năng mới muốn báo cho người dùng cũ thì tái sử dụng được cấu trúc
--   này, không phải đẻ thêm cột mỗi lần.
--
-- Hình dạng dữ liệu (frontend giữ hợp đồng ở models/onboarding.model.ts):
--
--   {
--     "status":       "not-started" | "running" | "done" | "skipped",
--     "currentStep":  "create-workspace" | "create-board" | ... | null,
--     "completed":    ["create-workspace", ...],
--     "seenCoachMarks": ["filter-hint", ...],
--     "greetCount":   0,
--     "updatedAt":    "2026-08-26T00:00:00.000Z"
--   }
--
-- ⚠️ KHÔNG đặt NOT NULL. Người dùng cũ (đã đăng ký trước migration này) phải
--    được phép có NULL — frontend hiểu NULL là "chưa từng chạy tour". Ép NOT
--    NULL kèm DEFAULT sẽ ghi mặc định cho toàn bộ hàng cũ, tức là mọi tài khoản
--    hiện có đột nhiên bị coi như "chưa được hướng dẫn" và bị chào lại từ đầu.
-- =====================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb;

COMMENT ON COLUMN users.onboarding_state IS
  'Trạng thái tour hướng dẫn người dùng mới. NULL = chưa từng chạy. Hình dạng xem frontend/src/app/models/onboarding.model.ts';
