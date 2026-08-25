import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type {
  ApiInviteLink,
  ApiInviteLinkAccepted,
  ApiInviteLinkPreview,
  CreateInviteLinkBody,
} from '../../models';
import { ApiService } from '../../services/api.service';
import { describeError, errorStatus } from '../../services/api-error.util';
import { withErrorState } from '../shared/error.feature';
import { withId, withoutId } from '../shared/entity.util';
import { initialInviteLinkState, type InviteLinkState } from './invite-link.state';

/**
 * Link mời vào tổ chức.
 *
 * Chỉ có `state.ts` + `store.ts`, không tách computed/methods/mapper như
 * `organization/` — theo đúng mục "Chia theo kích thước, đừng máy móc" mà
 * `board-prefs.store.ts` đã dẫn. Store này gói 5 endpoint và không có logic
 * dẫn xuất nào đáng tách; backend lại trả camelCase sẵn nên cũng không cần mapper.
 */
export const InviteLinkStore = signalStore(
  { providedIn: 'root' },
  withState<InviteLinkState>(initialInviteLinkState),
  withErrorState(),

  withComputed((store) => ({
    /**
     * Link còn dùng được, xếp mới nhất lên trước.
     *
     * Lọc theo `active` của SERVER. Không viết lại phép tính hạn ở đây — xem chú
     * thích trên trường `active` trong invite-link.model.ts.
     */
    activeLinks: computed<ApiInviteLink[]>(() =>
      store
        .links()
        .filter((l) => l.active)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),
  })),

  withMethods((store, api = inject(ApiService)) => ({
    // -------------------------------------------------- quản lý (owner/admin)

    /**
     * Nạp danh sách link của một tổ chức.
     *
     * Đổi tổ chức thì XOÁ danh sách cũ trước khi gọi, đừng để link của tổ chức
     * trước còn trên màn hình trong lúc chờ — người dùng sẽ tưởng chúng thuộc về
     * tổ chức đang mở và đi sao chép nhầm.
     */
    async loadLinks(orgId: string): Promise<void> {
      if (store.loadedForOrg() === orgId && store.links().length) return;
      patchState(store, { links: [], loadedForOrg: null, loading: true, lastError: null });
      try {
        const rows = await api.get<ApiInviteLink[]>(`/organizations/${orgId}/invite-links`);
        patchState(store, { links: rows, loadedForOrg: orgId, loading: false });
      } catch (e) {
        // 403 = thành viên thường mở modal. Đó không phải lỗi để hiện đỏ lên màn
        // hình; phần giao diện link vốn đã ẩn với họ. Im lặng bỏ qua.
        if (errorStatus(e) === 403) {
          patchState(store, { links: [], loadedForOrg: orgId, loading: false });
          return;
        }
        patchState(store, { loading: false });
        store.fail(describeError(e, 'Failed to load invite links.'));
      }
    },

    /** Tạo link mới. Trả về link vừa tạo để component hiện ô sao chép ngay. */
    async createLink(
      orgId: string,
      body: CreateInviteLinkBody,
    ): Promise<ApiInviteLink | null> {
      patchState(store, { loading: true, lastError: null });
      try {
        const link = await api.post<ApiInviteLink>(
          `/organizations/${orgId}/invite-links`,
          body,
        );
        patchState(store, { links: [link, ...store.links()], loading: false });
        return link;
      } catch (e) {
        patchState(store, { loading: false });
        store.fail(describeError(e, 'Failed to create the invite link.'));
        return null;
      }
    },

    /**
     * Thu hồi trước hạn.
     *
     * Không xoá khỏi danh sách mà đánh dấu `active: false` — người vừa thu hồi
     * cần thấy nó chuyển trạng thái để biết thao tác đã ăn. Biến mất lặng lẽ thì
     * họ không rõ là đã thu hồi hay chỉ lỗi hiển thị.
     */
    async revokeLink(linkId: string): Promise<void> {
      patchState(store, { revoking: withId(store.revoking(), linkId), lastError: null });
      try {
        await api.delete(`/invite-links/${linkId}`);
        patchState(store, {
          links: store.links().map((l) =>
            l.id === linkId ? { ...l, active: false, revokedAt: new Date().toISOString() } : l,
          ),
          revoking: withoutId(store.revoking(), linkId),
        });
      } catch (e) {
        patchState(store, { revoking: withoutId(store.revoking(), linkId) });
        store.fail(describeError(e, 'Failed to revoke the invite link.'));
      }
    },

    /** Rời màn quản lý thì bỏ token khỏi bộ nhớ — nó không cần sống lâu hơn màn đó. */
    clearLinks(): void {
      patchState(store, { links: [], loadedForOrg: null, revoking: new Set() });
    },

    // ------------------------------------------------------ dùng link (/join)

    /**
     * Xem trước một link.
     *
     * Phân biệt 410 với 404 ngay tại đây: câu chữ cho người dùng nằm trong
     * `message` của backend, chỉ việc chuyển tiếp.
     */
    async loadPreview(token: string): Promise<void> {
      patchState(store, { preview: { kind: 'loading' } });
      try {
        const preview = await api.get<ApiInviteLinkPreview>(
          `/invite-links/${encodeURIComponent(token)}/preview`,
        );
        patchState(store, { preview: { kind: 'ready', preview } });
      } catch (e) {
        const status = errorStatus(e);
        if (status === 410) {
          patchState(store, {
            preview: { kind: 'gone', message: describeError(e, 'This invite link is no longer usable.') },
          });
          return;
        }
        if (status === 404) {
          patchState(store, { preview: { kind: 'invalid', message: 'This invite link is not valid.' } });
          return;
        }
        patchState(store, {
          preview: { kind: 'invalid', message: describeError(e, 'Could not open this invite link.') },
        });
      }
    },

    /** Dùng link để vào tổ chức. Trả null khi hỏng — component đọc `preview` để biết vì sao. */
    async acceptLink(token: string): Promise<ApiInviteLinkAccepted | null> {
      patchState(store, { accepting: true, lastError: null });
      try {
        const res = await api.post<ApiInviteLinkAccepted>(
          `/invite-links/${encodeURIComponent(token)}/accept`,
          {},
        );
        patchState(store, { accepting: false });
        return res;
      } catch (e) {
        patchState(store, { accepting: false });
        // Link chết ngay giữa lúc bấm (người khác vừa lấy nốt lượt cuối) — đổi
        // luôn màn hình sang trạng thái chết thay vì bắn toast rồi vẫn hiện nút
        // Tham gia đã vô dụng.
        if (errorStatus(e) === 410) {
          patchState(store, {
            preview: { kind: 'gone', message: describeError(e, 'This invite link is no longer usable.') },
          });
          return null;
        }
        store.fail(describeError(e, 'Could not join the organization.'));
        return null;
      }
    },

    resetPreview(): void {
      patchState(store, { preview: { kind: 'idle' }, accepting: false });
    },
  })),
);
