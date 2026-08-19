-- Migration 0001 — cột mới phục vụ lớp 🔴 (#2 tự tạo danh sách+thẻ) và 🟠 (#4 mức ưu tiên) trong CLAUDE.md.
-- Chưa chạy vào Supabase — chỉ để tham khảo, chạy thủ công khi sẵn sàng.

-- #2: mỗi list có màu accent riêng (dot nhỏ trên tiêu đề cột).
ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS color text;

-- #4: mức độ ưu tiên thẻ — dùng ở modal tạo thẻ (#2) và hiển thị cờ ưu tiên (#4).
-- ⚠️ ĐÃ SỬA LỖI: bản cũ dùng ('cao','trung','thap') nhưng frontend gửi
--    'low' | 'medium' | 'high' (models/card.model.ts: CardPriority) → mọi INSERT
--    đều bị chặn bởi CHECK constraint. Giá trị phải khớp đúng với frontend.
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high'));
