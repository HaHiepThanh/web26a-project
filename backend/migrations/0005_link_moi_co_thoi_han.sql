-- =====================================================================
-- 0005 — Link mời vào tổ chức, có thời hạn
-- =====================================================================
--
-- CÁCH CHẠY: mở Supabase → SQL Editor → dán toàn bộ file này → Run.
-- Chạy lại nhiều lần không sao (đều có IF NOT EXISTS).
--
-- Khác gì `organization_invites` đang có?
--
--   organization_invites       — mời ĐÍCH DANH một người đã có tài khoản.
--                                Phải biết trước userId của họ.
--   organization_invite_links  — một đường link, AI cầm cũng dùng được,
--                                cho tới khi hết hạn hoặc bị thu hồi.
--
-- Hai cơ chế cùng tồn tại, không thay thế nhau: mời đích danh vẫn hợp lý khi
-- đã biết người cần mời, còn link hợp lý khi gửi vào nhóm chat cho cả đội.
-- =====================================================================

CREATE TABLE IF NOT EXISTS organization_invite_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Bí mật nằm ở đây. Sinh bằng crypto.randomBytes(32) → base64url ở backend,
  -- KHÔNG dùng gen_random_uuid(): uuid v4 chỉ có 122 bit ngẫu nhiên và ở nhiều
  -- hệ thống còn đoán được theo thời gian tạo. Link mời là thứ ai cầm cũng vào
  -- được nên phải coi như mật khẩu.
  token       text NOT NULL,

  -- Quyền người dùng link sẽ nhận. Không cho 'owner': mỗi tổ chức đúng 1 owner.
  role        text NOT NULL DEFAULT 'member',

  -- Bắt buộc có hạn. Cố ý KHÔNG cho phép null (= vĩnh viễn): link không hạn bị
  -- quên trong một nhóm chat cũ là cửa hậu mở mãi mãi.
  expires_at  timestamptz NOT NULL,

  -- Giới hạn số lượt dùng, null = không giới hạn (vẫn bị chặn bởi expires_at).
  max_uses    integer,
  used_count  integer NOT NULL DEFAULT 0,

  -- Thu hồi tay trước khi hết hạn. Dùng cột thời điểm chứ không phải cờ boolean
  -- để biết luôn "bị thu hồi lúc nào".
  revoked_at  timestamptz,

  created_by  text NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT org_invite_links_role_check CHECK (role IN ('admin', 'member')),
  CONSTRAINT org_invite_links_max_uses_check CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT org_invite_links_used_count_check CHECK (used_count >= 0)
);

-- Token phải là duy nhất toàn hệ thống — tra cứu luôn đi qua cột này.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_invite_link_token
  ON organization_invite_links (token);

-- Màn "quản lý link" liệt kê theo tổ chức, lọc cái còn sống.
CREATE INDEX IF NOT EXISTS idx_org_invite_links_org
  ON organization_invite_links (org_id, revoked_at, expires_at);

-- ---------------------------------------------------------------------
-- Nhật ký ai đã dùng link nào.
--
-- Vì sao tách bảng thay vì chỉ tăng `used_count`? Có `used_count` thì biết
-- "đã dùng 5 lượt" nhưng không biết AI đã vào. Khi cần soát lại "người này
-- vào tổ chức bằng đường nào" mà không có bảng này thì chịu.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_invite_link_uses (
  link_id  uuid NOT NULL REFERENCES organization_invite_links(id) ON DELETE CASCADE,
  user_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, user_id)
);

-- ---------------------------------------------------------------------
-- Kiểm tra lại: hai lệnh dưới phải chạy được và trả về bảng rỗng.
-- ---------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organization_invite_links'
ORDER BY ordinal_position;

SELECT count(*) AS so_link FROM organization_invite_links;
