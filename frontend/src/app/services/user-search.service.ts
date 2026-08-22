import { Injectable, inject, signal } from '@angular/core';
import { ApiUserSearchResult } from '../models';
import { ApiService } from './api.service';

/** Chờ ngần này mili-giây sau phím cuối rồi mới gọi API — gõ 20 ký tự mà bắn 20
 *  request thì vừa tốn vừa hay trả về kết quả cũ đè lên kết quả mới. */
const DEBOUNCE_MS = 250;

/** Query ngắn hơn ngần này thì backend trả rỗng — khỏi gọi cho phí. */
const MIN_LENGTH = 3;

/**
 * Tìm người dùng để mời vào tổ chức / thêm vào workspace — GỌI BACKEND THẬT.
 *
 * ⚠️ Trước đây việc này làm hoàn toàn ở frontend: `AuthService.getSearchableUsers()`
 *    đọc localStorage `trello_registered_users` — mà chỗ đó chỉ chứa những người
 *    đã ĐĂNG NHẬP TRÊN CHÍNH MÁY NÀY. Dán uid của đồng nghiệp vào thì không tìm
 *    thấy, và tệ hơn: `workspace-form-modal` BỊA ra một người tên `User-a1b2c3d4`
 *    với email giả `a1b2c3d4@trello.dev`. Thêm vào vẫn chạy (id thật) nên lỗi
 *    này rất dễ bị bỏ qua — nhìn thì tưởng đúng người.
 */
@Injectable({ providedIn: 'root' })
export class UserSearchService {
  private readonly api = inject(ApiService);

  readonly results = signal<ApiUserSearchResult[]>([]);
  readonly searching = signal(false);
  /** Đã gõ đủ dài, đã tìm xong, mà không ra ai — giao diện hiện "không tìm thấy". */
  readonly emptyResult = signal(false);

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Số thứ tự của lần tìm gần nhất — dùng để bỏ qua phản hồi về muộn. */
  private seq = 0;

  /** Gõ tới đâu tìm tới đó. Tự huỷ lần gọi trước nếu người dùng gõ tiếp. */
  search(query: string): void {
    if (this.timer) clearTimeout(this.timer);
    const q = query.trim();

    if (q.length < MIN_LENGTH) {
      this.results.set([]);
      this.emptyResult.set(false);
      this.searching.set(false);
      return;
    }

    this.searching.set(true);
    this.timer = setTimeout(() => void this.run(q), DEBOUNCE_MS);
  }

  private async run(q: string): Promise<void> {
    const lan = ++this.seq;
    try {
      const rows = await this.api.get<ApiUserSearchResult[]>(
        `/users/search?q=${encodeURIComponent(q)}`,
      );
      // Phản hồi của lần gõ CŨ về sau lần mới thì bỏ đi, nếu không danh sách
      // nhấp nháy về kết quả của chuỗi mà người dùng đã xoá.
      if (lan !== this.seq) return;
      this.results.set(rows);
      this.emptyResult.set(rows.length === 0);
    } catch {
      if (lan !== this.seq) return;
      this.results.set([]);
      this.emptyResult.set(true);
    } finally {
      if (lan === this.seq) this.searching.set(false);
    }
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.seq++;
    this.results.set([]);
    this.emptyResult.set(false);
    this.searching.set(false);
  }
}
