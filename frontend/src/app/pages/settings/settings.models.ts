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
    label: 'Profile',
    description: 'Avatar, account info & password',
    icon: 'user',
  },
  {
    id: 'manage-organization',
    label: 'Manage Organization',
    description: 'Members, invites & switching organizations',
    icon: 'building',
  },
  {
    id: 'manage-workspace',
    label: 'Manage Workspace',
    description: 'Manage members across your Workspaces',
    icon: 'org',
  },
];

// LANGUAGE_OPTIONS / TIMEZONE_OPTIONS đã bỏ: app cố định English + UTC+7 nên
// không cần cho người dùng chọn, và DB cũng không còn cột users.language/timezone.
