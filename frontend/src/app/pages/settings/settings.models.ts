/**
 * Shared types for Settings page.
 * Kept concise & focused on Profile & Manage Workspace.
 */

export type SettingsTab = 'profile' | 'manage-workspace';

export interface NavItem {
  id: SettingsTab;
  label: string;
  description: string;
  icon: 'user' | 'building';
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'profile',
    label: 'Trang cá nhân',
    description: 'Ảnh đại diện, thông tin tài khoản & đổi mật khẩu',
    icon: 'user',
  },
  {
    id: 'manage-workspace',
    label: 'Manage Workspace',
    description: 'Quản lý thành viên trong các Workspace của bạn',
    icon: 'building',
  },
];

export const LANGUAGE_OPTIONS = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'zh', label: '中文 (Chinese)' },
];

export const TIMEZONE_OPTIONS = [
  { value: 'UTC+7', label: '(GMT+07:00) Hà Nội, Bangkok, Jakarta' },
  { value: 'UTC+8', label: '(GMT+08:00) Singapore, Hong Kong' },
  { value: 'UTC+9', label: '(GMT+09:00) Tokyo, Seoul' },
  { value: 'UTC+0', label: '(GMT+00:00) London' },
  { value: 'UTC+1', label: '(GMT+01:00) Paris, Berlin' },
  { value: 'UTC-5', label: '(GMT-05:00) Eastern Time — New York' },
  { value: 'UTC-8', label: '(GMT-08:00) Pacific Time — Los Angeles' },
];
