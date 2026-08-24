import { Injectable, inject, signal, computed } from '@angular/core';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  onAuthStateChanged,
} from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { ApiService } from './api.service';
import {
  MOCK_SEARCHABLE_USERS,
  MeResponse,
  User,
  generateUuid,
} from '../models';
/** Phản hồi của GET /auth/me ở backend (xem backend/src/modules/auth/auth.service.ts). */
const STORAGE_KEY_USER = 'trello_user';
const STORAGE_KEY_ALL_USERS = 'trello_registered_users';

/**
 * Xác thực & Quản lý User (Firebase Auth + Demo/Local Storage State).
 * State giữ bằng signal: currentUser. Guard/component đọc qua signal này.
 * Khi tạo tài khoản / đăng nhập, user luôn có UUID v4 và Tên hiển thị đầy đủ.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebase = inject(FirebaseService);
  private readonly api = inject(ApiService);

  readonly currentUser = signal<User | null>(this.getInitialUser());
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  /**
   * id của người đang đăng nhập — CHÍNH LÀ Firebase uid, cũng là `users.id` dưới
   * database và là giá trị nằm trong `cards.assignee_id`, `comments.user_id`,
   * `messages.user_id`.
   *
   * Trước đây mỗi nơi tự khai một hằng số giả (`CURRENT_USER_ID = 'u-nam'`,
   * `CURRENT_CHAT_USER_ID = 'u-nam'`) nên không khớp uid thật: "Việc của tôi"
   * luôn rỗng, tin nhắn của mình vẫn căn trái, nút xoá bình luận không bao giờ
   * hiện. Đây là NGUỒN DUY NHẤT, đừng khai lại ở chỗ khác.
   *
   * Trả '' khi chưa đăng nhập — không id nào bằng '' nên mọi phép so sánh tự
   * động thành false, không cần chỗ gọi phải kiểm tra null.
   */
  readonly currentUserId = computed(() => this.currentUser()?.id ?? '');

  constructor() {
    try {
      if (this.firebase?.auth) {
        onAuthStateChanged(this.firebase.auth, (fbUser) => {
          if (fbUser) {
            const user: User = {
              id: fbUser.uid,
              email: fbUser.email ?? '',
              displayName: fbUser.displayName ?? undefined,
              avatarUrl: fbUser.photoURL ?? undefined,
            };
            this.setUser(user);
          }
        });
      }
    } catch {
      // Firebase might not be configured in demo mode
    }
  }

  private getInitialUser(): User | null {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_USER);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch {}
    }
    // Test trắng hoàn toàn: không tự đăng nhập user demo — MOCK_SEARCHABLE_USERS đang
    // comment nên rỗng, chưa đăng nhập thì thật sự là null (phải qua /login hoặc /register).
    return MOCK_SEARCHABLE_USERS[0] ?? null;
  }

  /** Thiết lập user hiện tại & lưu vào localStorage */
  setUser(user: User): void {
    this.currentUser.set(user);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
        // Lưu vào danh sách các user đã đăng ký để có thể search được
        this.saveToRegisteredUsers(user);
      } catch {}
    }
  }

  /** Đăng ký tài khoản mới vào danh sách user (KHÔNG tự đăng nhập — dùng cho trang Register,
   *  người dùng phải tự bấm Đăng nhập ở trang Login sau khi đăng ký thành công). */
  registerUser(user: User): void {
    this.saveToRegisteredUsers(user);
  }

  /** Lưu user vào danh sách người dùng trong hệ thống (để tìm kiếm theo UUID) */
  private saveToRegisteredUsers(user: User): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ALL_USERS);
      const list: User[] = saved ? JSON.parse(saved) : [];
      const idx = list.findIndex((u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
      if (idx >= 0) {
        list[idx] = user;
      } else {
        list.push(user);
      }
      localStorage.setItem(STORAGE_KEY_ALL_USERS, JSON.stringify(list));
    } catch {}
  }

  /** Lấy toàn bộ danh sách user khả dụng (gồm mock + user đã đăng ký) để tìm kiếm theo UUID/Tên/Email */
  getSearchableUsers(): User[] {
    const map = new Map<string, User>();
    // 1. Thêm mock users
    for (const u of MOCK_SEARCHABLE_USERS) {
      map.set(u.id, u);
    }
    // 2. Thêm current user
    const cur = this.currentUser();
    if (cur) {
      map.set(cur.id, cur);
    }
    // 3. Thêm các user đã đăng ký trong localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_ALL_USERS);
        if (saved) {
          const list: User[] = JSON.parse(saved);
          for (const u of list) {
            map.set(u.id, u);
          }
        }
      } catch {}
    }
    return Array.from(map.values());
  }

  /** Tìm user theo UUID chính xác hoặc gần đúng */
  findUserByUuid(uuid: string): User | undefined {
    const clean = uuid.trim().toLowerCase();
    return this.getSearchableUsers().find(
      (u) => u.id.toLowerCase() === clean || u.id.toLowerCase().startsWith(clean),
    );
  }

  /**
   * Đăng nhập Google bằng popup, rồi ĐỒNG BỘ hồ sơ xuống database qua backend.
   *
   * Vì sao phải gọi backend chứ không tự ghi thẳng vào Supabase?
   * Frontend chỉ có khoá công khai (anon) mà RLS đã chặn hết — đúng như thiết kế.
   * Chỉ backend giữ `service_role key` mới ghi được, và nó phải verify ID token
   * trước để chắc chắn người gọi đúng là chủ tài khoản Google đó.
   *
   * Trả về `needsOnboarding` để trang Login biết nên đưa user đi đâu.
   */
  async loginWithGoogle(): Promise<{ needsOnboarding: boolean }> {
    if (!this.firebase?.auth) {
      throw new Error('Firebase is not configured.');
    }

    const res = await signInWithPopup(this.firebase.auth, new GoogleAuthProvider());
    if (!res.user) throw new Error('Google sign-in did not return a user.');

    // GET /auth/me vừa upsert hồ sơ, vừa trả về danh sách tổ chức — 1 request là đủ.
    return this.syncFromBackend();
  }

  /**
   * Đăng ký bằng email + mật khẩu — QUA FIREBASE, không phải Supabase Auth.
   *
   * Vì sao Firebase chứ không Supabase Auth? Backend chỉ verify Firebase ID token,
   * và `users.id` trong DB chính là Firebase uid. Dùng Supabase Auth sẽ sinh ra
   * một uuid thứ hai cho cùng một người → hai danh tính, và token không qua nổi
   * FirebaseAuthGuard.
   *
   * Mật khẩu KHÔNG bao giờ đi qua server của chúng ta: Firebase tự băm scrypt +
   * salt riêng từng user. DB không có cột `password`.
   */
  async registerWithEmail(data: {
    email: string;
    password: string;
    displayName: string;
    username?: string;
    phone?: string;
  }): Promise<{ needsOnboarding: boolean }> {
    if (!this.firebase?.auth) throw new Error('Firebase is not configured.');

    const cred = await createUserWithEmailAndPassword(
      this.firebase.auth,
      data.email.trim(),
      data.password,
    );
    // Đặt tên hiển thị ngay để token sau đó mang sẵn claim `name`.
    if (data.displayName.trim()) {
      await updateProfile(cred.user, { displayName: data.displayName.trim() });
      await cred.user.getIdToken(true); // ép làm mới token để claim `name` có hiệu lực
    }

    // username/phone không nằm trong Firebase token — gửi riêng để backend lưu.
    await this.api.post('/auth/sync', {
      username: data.username?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
    });

    return this.syncFromBackend();
  }

  /** Đăng nhập bằng email + mật khẩu (Firebase). */
  async loginWithEmail(email: string, password: string): Promise<{ needsOnboarding: boolean }> {
    if (!this.firebase?.auth) throw new Error('Firebase is not configured.');
    await signInWithEmailAndPassword(this.firebase.auth, email.trim(), password);
    return this.syncFromBackend();
  }

  /**
   * Lưu hồ sơ xuống DATABASE qua backend (không chỉ localStorage).
   * Trước đây trang Cài đặt chỉ gọi setUser() nên bấm Lưu xong, F5 là mất.
   */
  async updateProfile(changes: {
    displayName?: string;
    username?: string;
    phone?: string;
    jobTitle?: string;
    avatarUrl?: string;
  }): Promise<void> {
    const row = await this.api.patch<MeResponse['user']>('/auth/profile', changes);
    this.setUser({
      id: row.id,
      email: row.email,
      displayName: row.displayName ?? undefined,
      avatarUrl: row.avatarUrl ?? undefined,
      username: row.username ?? undefined,
      phone: row.phone ?? undefined,
      jobTitle: row.jobTitle ?? undefined,
    });
  }

  /** Gọi backend để upsert hồ sơ vào DB + biết đã có tổ chức chưa. */
  private async syncFromBackend(): Promise<{ needsOnboarding: boolean }> {
    const me = await this.api.get<MeResponse>('/auth/me');
    this.setUser({
      id: me.user.id,
      email: me.user.email,
      displayName: me.user.displayName ?? undefined,
      avatarUrl: me.user.avatarUrl ?? undefined,
      username: me.user.username ?? undefined,
      phone: me.user.phone ?? undefined,
      jobTitle: me.user.jobTitle ?? undefined,
    });
    return { needsOnboarding: me.needsOnboarding };
  }

  // Đăng xuất
  async logout(): Promise<void> {
    if (this.firebase?.auth) {
      try {
        await signOut(this.firebase.auth);
      } catch {}
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
    this.currentUser.set(null);
  }
}

