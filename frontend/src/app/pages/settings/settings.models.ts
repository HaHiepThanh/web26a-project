/**
 * Shared types & mock data for the Settings page.
 * Kept separate from the component so the .ts file stays focused on behaviour.
 * Most of this data is UI-only mock state (no backend module exists yet for
 * notifications/billing/integrations in this project) — see settings.ts.
 */

export type SettingsTab =
  | 'profile'
  | 'notifications'
  | 'workspace'
  | 'appearance-security'
  | 'billing'
  | 'integrations';

export type MemberRole = 'Owner' | 'Admin' | 'Member' | 'Guest';
export type MemberStatus = 'active' | 'frozen';

export interface NavItem {
  id: SettingsTab;
  label: string;
  description: string;
  icon: 'user' | 'bell' | 'building' | 'palette' | 'card' | 'plug';
}

export interface Member {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string;
}

export interface DeviceSession {
  id: string;
  device: string;
  browser: string;
  icon: 'desktop' | 'mobile' | 'tablet';
  ip: string;
  location: string;
  lastActive: string;
  current: boolean;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  colorVar: string;
  initials: string;
  connected: boolean;
}

export interface ApiToken {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface NotificationRule {
  key: string;
  label: string;
  description: string;
  email: boolean;
  push: boolean;
}

export interface PlanOption {
  id: 'free' | 'pro' | 'business';
  name: string;
  price: string;
  period: string;
  features: string[];
  current: boolean;
  highlighted?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'profile', label: 'Trang cá nhân', description: 'Ảnh, thông tin cơ bản, liên hệ', icon: 'user' },
  { id: 'notifications', label: 'Thông báo', description: 'Kênh nhận & sự kiện thông báo', icon: 'bell' },
  { id: 'workspace', label: 'Không gian làm việc', description: 'Thông tin, thương hiệu, thành viên', icon: 'building' },
  { id: 'appearance-security', label: 'Giao diện & Bảo mật', description: 'Theme, mật khẩu, 2FA, phiên đăng nhập', icon: 'palette' },
  { id: 'billing', label: 'Gói dịch vụ', description: 'Gói hiện tại, tài nguyên, thanh toán', icon: 'card' },
  { id: 'integrations', label: 'Tích hợp & API', description: 'Ứng dụng liên kết, API keys', icon: 'plug' },
];

export const LANGUAGE_OPTIONS = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'zh', label: '中文 (Chinese)' },
];

export const TIMEZONE_OPTIONS = [
  { value: 'UTC-8', label: '(GMT-08:00) Pacific Time — Los Angeles' },
  { value: 'UTC-5', label: '(GMT-05:00) Eastern Time — New York' },
  { value: 'UTC+0', label: '(GMT+00:00) London' },
  { value: 'UTC+1', label: '(GMT+01:00) Paris, Berlin' },
  { value: 'UTC+7', label: '(GMT+07:00) Hà Nội, Bangkok, Jakarta' },
  { value: 'UTC+8', label: '(GMT+08:00) Singapore, Hong Kong' },
  { value: 'UTC+9', label: '(GMT+09:00) Tokyo, Seoul' },
];

export const ACCENT_COLORS: { name: string; value: string }[] = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Purple', value: '#9333ea' },
];

export function mockMembers(): Member[] {
  return [
    { id: 'u1', name: 'Đặng Chí Hoàng', email: 'dachoang332@gmail.com', avatarUrl: 'https://i.pravatar.cc/100?img=12', role: 'Owner', status: 'active', joinedAt: '2024-01-10' },
    { id: 'u2', name: 'Nguyễn Minh Anh', email: 'minhanh.nguyen@company.com', avatarUrl: 'https://i.pravatar.cc/100?img=5', role: 'Admin', status: 'active', joinedAt: '2024-02-14' },
    { id: 'u3', name: 'Trần Bảo Long', email: 'long.tran@company.com', avatarUrl: 'https://i.pravatar.cc/100?img=33', role: 'Member', status: 'active', joinedAt: '2024-03-02' },
    { id: 'u4', name: 'Lê Thu Hà', email: 'ha.le@company.com', avatarUrl: 'https://i.pravatar.cc/100?img=47', role: 'Member', status: 'active', joinedAt: '2024-05-21' },
    { id: 'u5', name: 'Phạm Quốc Việt', email: 'viet.pham@partner.com', avatarUrl: 'https://i.pravatar.cc/100?img=51', role: 'Guest', status: 'frozen', joinedAt: '2024-06-30' },
  ];
}

export function mockSessions(): DeviceSession[] {
  return [
    { id: 's1', device: 'MacBook Pro 16"', browser: 'Chrome 128 · macOS', icon: 'desktop', ip: '116.108.24.31', location: 'Hà Nội, Việt Nam', lastActive: 'Đang hoạt động', current: true },
    { id: 's2', device: 'iPhone 15 Pro', browser: 'Safari · iOS 18', icon: 'mobile', ip: '116.108.24.31', location: 'Hà Nội, Việt Nam', lastActive: '2 giờ trước', current: false },
    { id: 's3', device: 'Windows PC', browser: 'Edge 126 · Windows 11', icon: 'desktop', ip: '203.113.152.10', location: 'Hồ Chí Minh, Việt Nam', lastActive: '1 ngày trước', current: false },
    { id: 's4', device: 'iPad Air', browser: 'Safari · iPadOS 17', icon: 'tablet', ip: '14.169.87.201', location: 'Đà Nẵng, Việt Nam', lastActive: '5 ngày trước', current: false },
  ];
}

export function mockIntegrations(): Integration[] {
  return [
    { id: 'slack', name: 'Slack', description: 'Nhận thông báo và tạo thẻ trực tiếp từ kênh Slack', colorVar: '#4A154B', initials: 'SL', connected: true },
    { id: 'github', name: 'GitHub', description: 'Liên kết commit, pull request với thẻ công việc', colorVar: '#111827', initials: 'GH', connected: true },
    { id: 'gdrive', name: 'Google Drive', description: 'Đính kèm và xem trước tệp trực tiếp trong thẻ', colorVar: '#0d9488', initials: 'GD', connected: false },
    { id: 'figma', name: 'Figma', description: 'Nhúng bản thiết kế và theo dõi thay đổi file', colorVar: '#9333ea', initials: 'FG', connected: false },
  ];
}

export function mockApiTokens(): ApiToken[] {
  return [
    { id: 't1', name: 'CI/CD Pipeline', tokenPreview: 'pk_live_4f8a...c92e', createdAt: '2024-11-02', lastUsedAt: '2 giờ trước' },
    { id: 't2', name: 'Zapier Automation', tokenPreview: 'pk_live_9b21...7a44', createdAt: '2025-01-18', lastUsedAt: '3 ngày trước' },
  ];
}

export function mockNotificationRules(): NotificationRule[] {
  return [
    { key: 'mention', label: 'Được Tag / Mention', description: 'Khi ai đó nhắc đến bạn trong bình luận hoặc mô tả thẻ', email: true, push: true },
    { key: 'assigned', label: 'Được phân công thẻ mới', description: 'Khi bạn được thêm làm người phụ trách một thẻ/nhiệm vụ', email: true, push: true },
    { key: 'comment', label: 'Bình luận mới trong thẻ theo dõi', description: 'Khi có bình luận mới trong thẻ bạn đang theo dõi', email: false, push: true },
    { key: 'due', label: 'Nhắc nhở hạn chót', description: 'Nhắc trước khi thẻ đến hạn hoàn thành', email: true, push: true },
  ];
}

export function mockPlans(currentPlan: PlanOption['id']): PlanOption[] {
  return [
    {
      id: 'free', name: 'Free', price: '0₫', period: '/tháng', current: currentPlan === 'free',
      features: ['Tối đa 3 dự án', '5GB lưu trữ', 'Tối đa 10 thành viên', 'Lịch sử hoạt động 30 ngày'],
    },
    {
      id: 'pro', name: 'Pro', price: '199.000₫', period: '/người/tháng', current: currentPlan === 'pro', highlighted: true,
      features: ['Dự án không giới hạn', '100GB lưu trữ', 'Tối đa 50 thành viên', 'Tự động hoá quy trình', 'Hỗ trợ ưu tiên'],
    },
    {
      id: 'business', name: 'Business', price: '399.000₫', period: '/người/tháng', current: currentPlan === 'business',
      features: ['Mọi tính năng gói Pro', 'Lưu trữ không giới hạn', 'SSO & bảo mật nâng cao', 'SLA 99.9%', 'Quản lý theo phòng ban'],
    },
  ];
}
