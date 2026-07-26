import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { DetectTaskRequest, DetectTaskResponse } from '../models';

/**
 * [AI-CHAT] Cầu nối tới backend cho việc phát hiện tin giao task.
 *
 * QUAN TRỌNG: frontend KHÔNG gọi Claude API trực tiếp (lộ API key).
 * Service này chỉ POST tới endpoint backend (NestJS); backend mới gọi Claude API
 * và trả về đúng contract DetectTaskResponse (xem ai-task-detection.model.ts).
 *
 * Luồng: chat-input gửi tin -> ChatService.sendMessage -> gọi detectTask(...) ->
 *        nếu isTask: hiện <app-task-suggestion-card> để user XÁC NHẬN ->
 *        khi bấm đồng ý mới gọi CardService.createCard(...) tạo card thật.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/ai/detect-task`;

  // TODO: POST req tới this.endpoint, trả về DetectTaskResponse.
  //   return firstValueFrom(this.http.post<DetectTaskResponse>(this.endpoint, req));
  // Gợi ý khi BE chưa xong: mock trả về { isTask: false, confidence: 0, suggestion: null }.
  async detectTask(req: DetectTaskRequest): Promise<DetectTaskResponse> {
    // TODO
    return { isTask: false, confidence: 0, suggestion: null };
  }
}
