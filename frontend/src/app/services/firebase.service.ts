import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { environment } from '../../environments/environment';

/**
 * Khởi tạo Firebase App + Auth một lần cho toàn app.
 * AuthService dùng để đăng nhập; ApiService dùng để lấy ID token gắn vào request.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp = initializeApp(environment.firebase);
  readonly auth: Auth = getAuth(this.app);

  // TODO: lấy ID token của user hiện tại (null nếu chưa đăng nhập).
  //   return this.auth.currentUser ? await this.auth.currentUser.getIdToken() : null;
  async getIdToken(): Promise<string | null> {
    return this.auth.currentUser ? this.auth.currentUser.getIdToken() : null;
  }
}
