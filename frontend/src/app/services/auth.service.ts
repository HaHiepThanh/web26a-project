import { Injectable, inject, signal, computed } from '@angular/core';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { User, MOCK_SEARCHABLE_USERS, generateUuid } from '../models';

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

  readonly currentUser = signal<User | null>(this.getInitialUser());
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

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

  private getInitialUser(): User {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_USER);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch {}
    }
    // Mặc định khởi tạo user demo với UUID chuẩn
    return MOCK_SEARCHABLE_USERS[0];
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

  // Đăng nhập Google popup
  async loginWithGoogle(): Promise<void> {
    if (this.firebase?.auth) {
      const res = await signInWithPopup(this.firebase.auth, new GoogleAuthProvider());
      if (res.user) {
        const user: User = {
          id: res.user.uid,
          email: res.user.email ?? '',
          displayName: res.user.displayName ?? undefined,
          avatarUrl: res.user.photoURL ?? undefined,
        };
        this.setUser(user);
      }
    }
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

