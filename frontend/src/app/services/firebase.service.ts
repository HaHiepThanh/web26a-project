import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, Auth, User as FirebaseUser } from 'firebase/auth';
import { environment } from '../../environments/environment';

/**
 * Khởi tạo Firebase App + Auth một lần cho toàn app.
 * AuthService dùng để đăng nhập; ApiService dùng để lấy ID token gắn vào request.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp = initializeApp(environment.firebase);
  readonly auth: Auth = getAuth(this.app);

  /**
   * Chờ Firebase khôi phục xong phiên đăng nhập từ IndexedDB.
   *
   * ⚠️ Đây là chỗ từng gây bug rất khó lần ra. Khi F5, `auth.currentUser` là
   *    `null` trong vài trăm mili-giây đầu — Firebase đọc phiên từ IndexedDB một
   *    cách BẤT ĐỒNG BỘ. Trong khoảng đó, `getIdToken()` trả null, request bay đi
   *    không có header Authorization, backend trả 401, và app tưởng người dùng
   *    không có tổ chức nào → đá về /onboarding hoặc /not-found.
   *
   *    Triệu chứng kinh điển: đăng nhập thì đúng, F5 một cái là hỏng, F5 lần nữa
   *    có khi lại đúng (tuỳ máy nhanh chậm).
   *
   *    `onAuthStateChanged` gọi callback ĐÚNG MỘT LẦN ngay khi biết kết quả —
   *    kể cả khi kết quả là "chưa đăng nhập". Nên promise này luôn resolve.
   */
  private readonly authReady: Promise<FirebaseUser | null> = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(this.auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });

  /** ID token của user hiện tại (null nếu chưa đăng nhập). */
  async getIdToken(): Promise<string | null> {
    await this.authReady;
    return this.auth.currentUser ? this.auth.currentUser.getIdToken() : null;
  }

  /** Cho AuthService/guard chờ Firebase sẵn sàng trước khi quyết định điều hướng. */
  async waitForAuthReady(): Promise<FirebaseUser | null> {
    return this.authReady;
  }
}
