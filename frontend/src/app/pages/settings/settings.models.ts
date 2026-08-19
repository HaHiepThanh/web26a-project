/**
 * Shared types for Settings page.
 * Kept concise & focused on Profile & Manage Workspace.
 */

export type SettingsTab = 'profile' | 'manage-workspace' | 'manage-organization';

export interface NavItem {
  id: SettingsTab;
  label: string;
  description: string;
  icon: 'user' | 'building' | 'org';
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'profile',
    label: 'Trang cá nhân',
    description: 'Ảnh đại diện, thông tin tài khoản & đổi mật khẩu',
    icon: 'user',
  },
  {
    id: 'manage-organization',
    label: 'Quản lý Organization',
    description: 'Thành viên, lời mời & chuyển đổi tổ chức',
    icon: 'building',
  },
  {
    id: 'manage-workspace',
    label: 'Manage Workspace',
    description: 'Quản lý thành viên trong các Workspace của bạn',
    icon: 'org',
  },
];

// LANGUAGE_OPTIONS / TIMEZONE_OPTIONS đã bỏ: app cố định English + UTC+7 nên
// không cần cho người dùng chọn, và DB cũng không còn cột users.language/timezone.
