import { Injectable, inject, signal, computed } from '@angular/core';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  onAuthStateChanged,
} from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { ApiService } from './api.service';
import {
  MOCK_SEARCHABLE_USERS,
  MeResponse,
  OnboardingState,
  User,
  generateUuid,
  parseOnboardingState,
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
            // ⚠️ TRƯỚC ĐÂY dựng `User` chỉ từ 3 field Firebase có sẵn
            // (uid/email/displayName/photoURL) rồi `setUser()` thẳng — ghi ĐÈ
            // LÊN hồ sơ đầy đủ (avatar thật đã lưu qua PATCH /auth/profile,
            // username, phone, jobTitle) mà `getInitialUser()` vừa nạp từ
            // localStorage. `onAuthStateChanged` tự bắn lại MỖI LẦN tải trang
            // (Firebase khôi phục phiên đã lưu) nên hồ sơ đầy đủ bị xoá ngay
            // sau F5, dù dữ liệu vẫn còn nguyên trên server — reload là "mất"
            // avatar/username dù chưa hề đổi gì. Gọi lại `syncFromBackend()` —
            // nguồn DUY NHẤT có avatarUrl thật — thay vì tự dựng user cụt.
            void this.syncFromBackend().catch(() => {
              // Backend/mạng lỗi đúng lúc này thì vẫn còn bản localStorage cũ
              // trong currentUser() (nạp từ getInitialUser() lúc khởi tạo) —
              // để nguyên, còn hơn xoá sạch về "chưa đăng nhập".
            });
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

  /** Kiểm tra user hiện tại đã có phương thức đăng nhập bằng Mật khẩu chưa. */
  hasPasswordAuth(): boolean {
    const user = this.firebase?.auth?.currentUser;
    if (!user) return false;
    return user.providerData.some((p) => p.providerId === 'password');
  }

  /**
   * Thiết lập mật khẩu LẦN ĐẦU cho tài khoản đăng nhập bằng Google (chưa có mật khẩu).
   * Dùng `linkWithCredential` để gắn provider `password` vào tài khoản Firebase Auth.
   */
  async setPassword(newPassword: string): Promise<void> {
    const user = this.firebase?.auth?.currentUser;
    if (!user?.email) throw new Error('You need to sign in first.');
    const credential = EmailAuthProvider.credential(user.email, newPassword);
    await linkWithCredential(user, credential);
  }

  /**
   * Gửi email đặt lại mật khẩu qua Firebase Auth.
   */
  async sendPasswordReset(email: string): Promise<void> {
    if (!this.firebase?.auth) throw new Error('Firebase is not configured.');
    await sendPasswordResetEmail(this.firebase.auth, email.trim());
  }

  /**
   * Đổi mật khẩu THẬT trên Firebase.
   *
   * ⚠️ Trước đây trang Cài đặt không hề gọi tới đây — nó so mật khẩu hiện tại
   *    với `User.password` (một trường còn sót từ thời dữ liệu giả, tài khoản
   *    thật luôn `undefined` nên phép so bị bỏ qua sạch), rồi ghi mật khẩu mới
   *    vào localStorage và báo "thành công". Mật khẩu trên Firebase không đổi
   *    một chữ: đăng xuất rồi vào lại thì chỉ mật khẩu CŨ mới dùng được.
   *
   * `reauthenticateWithCredential` làm hai việc cùng lúc, cả hai đều cần:
   *   1. Kiểm mật khẩu hiện tại có đúng không — việc mà bản cũ chưa từng làm.
   *   2. Làm mới phiên đăng nhập. `updatePassword` từ chối với
   *      `auth/requires-recent-login` nếu người dùng đăng nhập đã lâu.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.firebase?.auth?.currentUser;
    if (!user?.email) throw new Error('You need to sign in again before changing your password.');

    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
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
    this.setUser(this.toUser(row));
  }

  /**
   * Ghi trạng thái tour hướng dẫn xuống DB, và cập nhật `currentUser()` ngay.
   *
   * Tách khỏi `updateProfile()` dù cùng gọi một endpoint, vì hai thứ khác bản
   * chất: `updateProfile` là người dùng chủ động sửa hồ sơ ở trang Cài đặt và
   * cần biết lỗi; còn cái này chạy ngầm sau mỗi bước tour.
   *
   * ⚠️ Cập nhật signal TRƯỚC rồi mới gọi API (optimistic). Tour chuyển bước theo
   *    signal này — chờ round-trip mới cho đi tiếp thì mỗi bước khựng vài trăm
   *    ms trên mạng chậm, và tour đứng hình hẳn nếu request rớt. Ghi hỏng thì
   *    hậu quả nhẹ nhất có thể: lần đăng nhập sau bị hỏi lại một lần.
   */
  async saveOnboardingState(state: OnboardingState): Promise<void> {
    const cur = this.currentUser();
    if (!cur) return;
    this.setUser({ ...cur, onboardingState: state });

    // Hỏng một lần thì THÔI HẲN trong phiên này.
    //
    // Nguyên nhân hỏng thường trực nhất là cột `users.onboarding_state` chưa
    // được tạo (migration 0007 chưa chạy) — và lỗi đó thì gọi lại bao nhiêu lần
    // cũng hỏng. Không có cái cờ này thì mỗi bước tour lại bắn thêm một request
    // chắc chắn trả 500: bảng Network đỏ rực, backend nhận một tràng lệnh vô
    // nghĩa, và trên mạng chậm là mỗi bước thêm một vòng chờ vô ích.
    if (AuthService.onboardingSaveDisabled) return;

    // Xếp hàng MỘT LƯỢT MỘT, và chỉ giữ trạng thái mới nhất.
    //
    // Chỗ gọi bắn kiểu `void` nên nhiều lượt chạy song song. Đo thật: bỏ qua bốn
    // bước liên tiếp là bốn request cùng bay đi, cầu dao bên dưới chỉ sập khi
    // phản hồi ĐẦU TIÊN về — nên vẫn có bốn lỗi 500 thay vì một. Gộp lại thì
    // vừa hết tràng lỗi đó, vừa bớt hẳn lưu lượng lúc bình thường: các bước đổi
    // dồn dập chỉ tốn một request mang trạng thái cuối cùng.
    this.pendingOnboarding = state;
    if (this.savingOnboarding) return;

    this.savingOnboarding = true;
    try {
      while (this.pendingOnboarding) {
        const gui = this.pendingOnboarding;
        this.pendingOnboarding = null;
        await this.api.patch<MeResponse['user']>('/auth/profile', {
          onboardingState: gui,
        });
      }
    } catch {
      AuthService.onboardingSaveDisabled = true;
      this.pendingOnboarding = null;
      // Không toast: giữa lúc đang hướng dẫn thì một hộp lỗi còn phiền hơn cái
      // lỗi. Ghi một dòng cảnh báo DUY NHẤT để người phát triển biết đường sửa.
      console.warn(
        '[onboarding] Không lưu được tiến độ tour xuống máy chủ — tạm dùng ' +
          'localStorage cho phiên này. Thường là do chưa chạy migration ' +
          'backend/migrations/0007_trang_thai_huong_dan.sql.',
      );
    } finally {
      this.savingOnboarding = false;
    }
  }

  /** Trạng thái mới nhất còn chờ gửi; lượt đang chạy sẽ nuốt luôn nó. */
  private pendingOnboarding: OnboardingState | null = null;
  private savingOnboarding = false;

  /**
   * Tĩnh, không phải theo từng instance: `AuthService` là singleton cấp gốc, mà
   * để tĩnh thì cờ này còn sống qua cả những lần tạo lại service trong test.
   */
  private static onboardingSaveDisabled = false;

  /** Một chỗ duy nhất dựng `User` từ hồ sơ backend trả về. */
  private toUser(row: MeResponse['user']): User {
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName ?? undefined,
      avatarUrl: row.avatarUrl ?? undefined,
      username: row.username ?? undefined,
      phone: row.phone ?? undefined,
      jobTitle: row.jobTitle ?? undefined,
      onboardingState: this.mergeOnboardingState(row.onboardingState),
    };
  }

  /**
   * Server KHÔNG CÓ Ý KIẾN thì giữ bản đang có, đừng coi là lệnh xoá.
   *
   * `/auth/me` được gọi lại mỗi lần tải trang và mỗi lần Firebase làm mới token.
   * Nếu nó trả về `null` cho `onboardingState` — cột `onboarding_state` chưa được
   * tạo (migration 0007 chưa chạy), hoặc lần ghi trước thất bại — thì lấy bản
   * rỗng đó ghi đè lên bản đã lưu ở localStorage là xoá sạch tiến độ: người dùng
   * đi tới bước 3, F5 một cái là app hỏi lại "Want a quick tour?" như chưa từng
   * gặp họ.
   *
   * `null` nghĩa là "không có thông tin", không phải "hãy đặt lại". Chỉ khi server
   * gửi về một object thật thì nó mới được quyền quyết định — lúc đó nó là nguồn
   * sự thật và ghi đè là đúng, kể cả khi ghi đè bằng trạng thái sớm hơn.
   */
  private mergeOnboardingState(raw: unknown): OnboardingState {
    if (raw === null || raw === undefined) {
      const cached = this.currentUser()?.onboardingState;
      if (cached) return cached;
    }
    return parseOnboardingState(raw);
  }

  /**
   * Tải ảnh đại diện lên Supabase Storage qua backend và đồng bộ Firebase + state.
   */
  async uploadAvatar(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const res = await this.api.upload<{ avatarUrl: string }>('/auth/avatar', form);

    const cur = this.currentUser();
    if (cur) {
      this.setUser({ ...cur, avatarUrl: res.avatarUrl });
    }

    if (this.firebase?.auth?.currentUser) {
      try {
        await updateProfile(this.firebase.auth.currentUser, { photoURL: res.avatarUrl });
      } catch {}
    }

    return res.avatarUrl;
  }

  /** Gọi backend để upsert hồ sơ vào DB + biết đã có tổ chức chưa. */
  private async syncFromBackend(): Promise<{ needsOnboarding: boolean }> {
    const me = await this.api.get<MeResponse>('/auth/me');
    this.setUser(this.toUser(me.user));
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

