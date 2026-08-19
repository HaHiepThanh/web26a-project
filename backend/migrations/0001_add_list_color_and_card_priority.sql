-- Migration 0001 — bản vá ALTER TABLE cho schema ĐỜI CŨ.
--
-- ⚠️ CÀI MỚI THÌ KHÔNG CHẠY FILE NÀY — dùng thẳng `database.sql` ở thư mục gốc,
--    cột `cards.priority` đã có sẵn trong đó rồi.
--    File này chỉ giữ lại cho ai đã lỡ dựng DB theo schema cũ.

-- #4: mức độ ưu tiên thẻ — dùng ở modal tạo thẻ và cờ ưu tiên trên mặt thẻ.
-- ⚠️ ĐÃ SỬA LỖI: bản cũ dùng ('cao','trung','thap') nhưng frontend gửi
--    'low' | 'medium' | 'high' (models/card.model.ts: CardPriority) → mọi INSERT
--    đều bị chặn bởi CHECK constraint. Giá trị phải khớp đúng với frontend.
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high'));

-- ❌ ĐÃ BỎ: phần thêm cột `lists.color`.
--    Ứng dụng không có tính năng cho người dùng đổi màu cột, cột này chưa từng
--    được ghi dữ liệu. Chấm tròn trên tiêu đề cột nay dùng màu xám cố định.
--    Nếu DB của bạn đã lỡ có cột này, xoá đi bằng:
--        ALTER TABLE lists DROP COLUMN IF EXISTS color;
