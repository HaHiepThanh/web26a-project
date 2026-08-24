import { effect, inject, untracked } from '@angular/core';
import { signalStore, withHooks, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import type { Organization } from '../../mocks';
import { AuthService } from '../../services/auth.service';
import { withErrorState } from '../shared/error.feature';
import { withOrganizationComputed } from './organization.computed';
import { withOrganizationMethods } from './organization.methods';
import { withOrganizationRealtime } from './organization.realtime';
import { initialOrganizationState, type OrganizationState } from './organization.state';

/**
 * Tổ chức của người đang đăng nhập.
 *
 * Chỉ ghép các mảnh lại — mọi logic nằm trong `*.computed.ts`, `*.methods.ts`,
 * `*.realtime.ts`. Thứ tự dưới đây quan trọng: feature nào dùng gì thì thứ đó
 * phải được khai báo TRƯỚC nó.
 */
export const OrganizationStore = signalStore(
  { providedIn: 'root' },

  withEntities<Organization>(),
  withState<OrganizationState>(initialOrganizationState),
  withErrorState(),

  withOrganizationComputed(),
  withOrganizationMethods(),
  withOrganizationRealtime(),

  withHooks({
    onInit(store) {
      const auth = inject(AuthService);

      // Đổi tài khoản thì nạp lại; đăng xuất thì dọn sạch. Không dọn là dữ liệu
      // người trước còn nguyên trên màn hình người sau.
      //
      // ⚠️ Bọc untracked: cả clearAll lẫn ensureLoaded đều ĐỌC state của chính
      //    store này. Không bọc thì effect tự đăng ký phụ thuộc vào state mà nó
      //    vừa ghi, và chạy vòng vô tận. Effect chỉ được theo dõi đúng một thứ:
      //    người đang đăng nhập là ai.
      effect(() => {
        const uid = auth.currentUser()?.id ?? null;
        untracked(() => {
          if (!uid) {
            store.clearAll();
            return;
          }
          // ensureLoaded tự bỏ qua nếu đã nạp cho đúng uid này rồi.
          void store.ensureLoaded();
        });
      });
    },
  }),
);
