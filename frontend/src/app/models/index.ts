// Barrel export: import gọn `import { Board, Card } from '../models';`
export * from './user.model';
export * from './organization.model';
export * from './organization-member.model';
export * from './invite.model';
export * from './workspace.model';
export * from './workspace-item.model';
export * from './board.model';
export * from './board-stats.model';
export * from './board-minimap.model';
export * from './list.model';
export * from './card.model';
export * from './label.model';
// --- Bonus ---
export * from './checklist-item.model';
export * from './comment.model';
export * from './attachment.model';
export * from './activity-log.model';
// --- AI chat ---
export * from './message.model';
export * from './ai-task-detection.model';
// --- Kiểu dùng chung cho giao diện ---
export * from './toast.model';
// --- Hợp đồng dữ liệu với backend (hình dạng JSON NestJS trả về) ---
export * from './api.model';
// --- Hợp đồng sự kiện WebSocket (khớp backend/src/modules/realtime/realtime.events.ts) ---
export * from './realtime.model';
// --- Thông báo ở chuông Header ---
export * from './notification.model';
