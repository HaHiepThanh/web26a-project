-- Migration 0002 — phục vụ mục 11 (🟡) trong CLAUDE.md: audit trail lọc theo card.
-- Chưa chạy vào Supabase — chỉ để tham khảo, chạy thủ công khi sẵn sàng.

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS card_id uuid REFERENCES cards(id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_card_id ON activity_logs (card_id);
