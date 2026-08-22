import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FirebaseService } from './firebase.service';
import { environment } from '../../environments/environment';

/**
 * Cầu nối tới backend NestJS. Mọi data service gọi qua đây thay vì Supabase trực tiếp
 * (kiến trúc Full backend). Tự đính kèm Firebase ID token vào header Authorization.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly firebase = inject(FirebaseService);
  private readonly base = environment.apiUrl;

  // TODO: tạo headers có 'Authorization: Bearer <idToken>'.
  private async authHeaders(): Promise<HttpHeaders> {
    const token = await this.firebase.getIdToken();
    return new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
  }

  async get<T>(path: string): Promise<T> {
    return firstValueFrom(
      this.http.get<T>(`${this.base}${path}`, { headers: await this.authHeaders() }),
    );
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(`${this.base}${path}`, body, { headers: await this.authHeaders() }),
    );
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.patch<T>(`${this.base}${path}`, body, { headers: await this.authHeaders() }),
    );
  }

  /**
   * Gửi tệp (multipart/form-data).
   *
   * ⚠️ KHÔNG tự đặt `Content-Type`. Trình duyệt phải tự sinh header đó kèm
   *    `boundary=...` để server tách được các phần; đặt tay là mất boundary và
   *    request hỏng ngay. Vì vậy ở đây chỉ đính kèm Authorization.
   */
  async upload<T>(path: string, form: FormData): Promise<T> {
    const token = await this.firebase.getIdToken();
    const headers = new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
    return firstValueFrom(this.http.post<T>(`${this.base}${path}`, form, { headers }));
  }

  async delete<T>(path: string): Promise<T> {
    return firstValueFrom(
      this.http.delete<T>(`${this.base}${path}`, { headers: await this.authHeaders() }),
    );
  }
}
