import { Injectable } from '@angular/core';
import { DetectTaskMember, DetectTaskRequest, DetectTaskResponse } from '../models';

const TASK_KEYWORDS = ['gấp', 'giao', 'fix', 'sửa', 'trước', 'hạn', 'deadline', 'làm giúp', 'giúp mình', 'cần làm'];

function stripMention(content: string, member: DetectTaskMember | null): string {
  if (!member) return content.trim();
  return content.replace(`@${member.displayName}`, '').replace(/\s+/g, ' ').trim();
}

/**
 * [AI-CHAT] Cầu nối tới backend cho việc phát hiện tin giao task.
 *
 * QUAN TRỌNG: frontend KHÔNG gọi Claude API trực tiếp (lộ API key). Đúng kiến trúc
 * là POST tới backend NestJS (`POST /ai/detect-task`), backend mới gọi Claude API.
 *
 * Backend hiện chưa hoàn thiện endpoint này (`ai.service.ts` phía backend vẫn là
 * TODO) — nên tạm thời dùng heuristic đơn giản tại chỗ (khớp @nhắc tên + từ khoá
 * giao việc) để demo được luồng UI trọn vẹn. Khi backend xong, chỉ cần thay thân
 * hàm này bằng `firstValueFrom(this.http.post<DetectTaskResponse>(this.endpoint, req))`,
 * contract (DetectTaskRequest/Response) đã đúng sẵn nên không phải sửa gì ở phía gọi.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  async detectTask(req: DetectTaskRequest): Promise<DetectTaskResponse> {
    const lower = req.content.toLowerCase();
    const mentioned = req.members.find((m) => lower.includes(`@${m.displayName.toLowerCase()}`));
    const hasKeyword = TASK_KEYWORDS.some((kw) => lower.includes(kw));

    if (!hasKeyword) {
      return { isTask: false, confidence: 0, suggestion: null };
    }

    return {
      isTask: true,
      confidence: mentioned ? 0.86 : 0.62,
      suggestion: {
        title: stripMention(req.content, mentioned ?? null) || req.content.trim(),
        assigneeId: mentioned?.id,
      },
    };
  }
}
