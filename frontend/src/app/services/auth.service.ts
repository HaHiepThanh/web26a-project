import { Injectable, inject, signal, computed } from '@angular/core';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { User } from '../models';

/**
 * Xác thực bằng Firebase Auth (Google SignInPopup) (#1).
 * State giữ bằng signal: currentUser. Guard/component đọc qua signal này.
 * Sau khi login, gọi backend POST /auth/sync để đồng bộ hồ sơ vào bảng users.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebase = inject(FirebaseService);

  readonly currentUser = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  constructor() {
    // TODO: onAuthStateChanged(this.firebase.auth, (fbUser) => { map -> currentUser });
    onAuthStateChanged(this.firebase.auth, (fbUser) => {
      this.currentUser.set(
        fbUser
          ? {
              id: fbUser.uid,
              email: fbUser.email ?? '',
              displayName: fbUser.displayName ?? undefined,
              avatarUrl: fbUser.photoURL ?? undefined,
            }
          : null,
      );
    });
  }

  // TODO: đăng nhập Google popup -> sau đó gọi ApiService POST /auth/sync.
  async loginWithGoogle(): Promise<void> {
    await signInWithPopup(this.firebase.auth, new GoogleAuthProvider());
    // TODO: gọi backend /auth/sync để upsert bản ghi users.
  }

  // TODO: đăng xuất.
  async logout(): Promise<void> {
    await signOut(this.firebase.auth);
  }
}
