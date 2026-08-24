import { computed, inject } from '@angular/core';
import { signalStoreFeature, withComputed, type } from '@ngrx/signals';
import type { EntityProps, EntityState } from '@ngrx/signals/entities';
import type { Organization } from '../../mocks';
import { RouteContextStore } from '../route-context/route-context.store';
import type { OrganizationState } from './organization.state';

/**
 * Phần suy ra từ state — không có gì tự giữ, đọc là tính.
 *
 * `activeOrgId` KHÔNG nằm trong store này mà ở `RouteContextStore`: nó là ngữ
 * cảnh URL, và mọi miền khác (workspace, board, list) đều cần đọc. Để ở đây thì
 * `ListStore` phải inject `OrganizationStore` chỉ để lấy một chuỗi.
 */
export function withOrganizationComputed() {
  return signalStoreFeature(
    {
      state: type<EntityState<Organization> & OrganizationState>(),
      // `entities` là computed do withEntities sinh ra nên nằm ở props, không
      // phải state — thiếu dòng này là TypeScript không thấy nó.
      props: type<EntityProps<Organization>>(),
    },

    withComputed((store, route = inject(RouteContextStore)) => {
      // `entities()` trả về theo thứ tự chèn, không theo tên. Sắp lại ở đây để
      // bộ chuyển tổ chức không nhảy loạn mỗi lần nạp lại.
      const organizations = computed(() =>
        [...store.entities()].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      );

      const activeOrg = computed(
        () => store.entities().find((o) => o.id === route.activeOrgId()) ?? null,
      );

      const myRole = computed(() => {
        const id = route.activeOrgId();
        return id ? (store.myRoleByOrg()[id] ?? null) : null;
      });

      return {
        organizations,

        /**
         * Đọc lại từ RouteContextStore cho tiện — nguồn sự thật vẫn nằm ở đó.
         *
         * Bày ra đây để component không phải inject thêm một store nữa chỉ để
         * lấy một chuỗi. Chỉ ĐỌC: muốn đổi thì gọi switchOrg().
         */
        activeOrgId: route.activeOrgId,

        activeOrg,
        activeOrgSlug: computed(() => activeOrg()?.slug ?? ''),
        pendingInviteCount: computed(() => store.myInvites().length),
        myRole,
        isOwner: computed(() => myRole() === 'owner'),
        isAdminOrOwner: computed(() => myRole() === 'owner' || myRole() === 'admin'),

        /**
         * Đã nạp xong và đúng là không có tổ chức nào.
         *
         * ⚠️ Guard onboarding phải dùng cờ này chứ KHÔNG phải `organizations().length === 0`.
         *    Rỗng vì lỗi mạng khác hẳn rỗng vì chưa tham gia tổ chức nào — đá
         *    người ta sang /onboarding trong trường hợp đầu là nói dối họ rằng
         *    dữ liệu của họ không tồn tại.
         */
        hasNoOrg: computed(() => store.status() === 'loaded' && store.entities().length === 0),
      };
    }),
  );
}
