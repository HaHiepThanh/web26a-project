-- =====================================================================
-- 0003 — Phạm vi hiển thị của workspace + quyền chọn sẵn khi mời
-- =====================================================================
--
-- CÁCH CHẠY: mở Supabase → SQL Editor → dán toàn bộ file này → Run.
-- Chạy lại nhiều lần không sao (đều có IF NOT EXISTS / DROP IF EXISTS).
--
-- Thêm 2 cột:
--
--   workspaces.visibility        'org' | 'restricted'
--       'org'        — mọi thành viên trong tổ chức đều thấy workspace này
--       'restricted' — chỉ những người có tên trong `workspace_members`
--
--   organization_invites.role    'admin' | 'member'
--       Quyền mà người được mời sẽ nhận KHI HỌ ĐỒNG Ý. Trước đây luôn cứng
--       là 'member' nên owner không có cách nào mời thẳng một admin.
--       Không cho mời làm 'owner': mỗi tổ chức chỉ có đúng 1 owner, muốn
--       chuyển thì dùng PATCH /organizations/:id/members/:userId/role.
-- =====================================================================

-- --------------------------------------------------------------- 1
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'org';

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_visibility_check;
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_visibility_check
  CHECK (visibility IN ('org', 'restricted'));

-- Workspace đã tạo trước đây: giữ nguyên hành vi cũ (cả tổ chức đều thấy).
UPDATE workspaces SET visibility = 'org' WHERE visibility IS NULL;

-- --------------------------------------------------------------- 2
ALTER TABLE organization_invites
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

ALTER TABLE organization_invites DROP CONSTRAINT IF EXISTS organization_invites_role_check;
ALTER TABLE organization_invites
  ADD CONSTRAINT organization_invites_role_check
  CHECK (role IN ('admin', 'member'));

-- --------------------------------------------------------------- 3
-- Lọc "workspace nào tôi thấy được" chạy trên 2 cột này ở MỌI lần mở trang
-- Workspace, nên đánh index. Thiếu index thì mỗi lần mở phải quét cả bảng.
CREATE INDEX IF NOT EXISTS idx_workspaces_org_visibility
  ON workspaces (org_id, visibility);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user
  ON workspace_members (user_id);

CREATE INDEX IF NOT EXISTS idx_board_members_user
  ON board_members (user_id);

-- --------------------------------------------------------------- 4
-- Kiểm tra lại: 2 dòng dưới phải trả ra đúng cột vừa thêm.
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE (table_name = 'workspaces' AND column_name = 'visibility')
   OR (table_name = 'organization_invites' AND column_name = 'role')
ORDER BY table_name;
