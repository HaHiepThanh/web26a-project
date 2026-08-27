import { inject } from '@angular/core';
import { patchState, signalStoreFeature, withMethods, type } from '@ngrx/signals';
import {
  setAllEntities,
  upsertEntity,
  type EntityProps,
  type EntityState,
} from '@ngrx/signals/entities';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { FirebaseService } from '../../services/firebase.service';
import { describeError } from '../../services/api-error.util';
import { loi, type ErrorState } from '../shared/error.feature';
import { loadActiveOrgId, persistActiveOrgId } from '../../mocks';
import type { Organization, OrgInvite } from '../../mocks';
import type {
  ApiCreatedOrg,
  ApiMyInvite,
  ApiMyOrg,
  ApiOrgMember,
  ApiPendingInvite,
  OrgInviteRole,
  OrgMemberView,
} from '../../models';
import { RouteContextStore } from '../route-context/route-context.store';
import { toMyInvite, toOrganization, toOrgMemberView, toPendingInvite } from './organization.mapper';
import { initialOrganizationState, type OrganizationState, type OrgRole } from './organization.state';

export function withOrganizationMethods() {
  return signalStoreFeature(
    {
      state: type<
        EntityState<Organization> & OrganizationState & ErrorState
      >(),
      props: type<EntityProps<Organization>>(),
    },

    withMethods(
      (
        store,
        api = inject(ApiService),
        firebase = inject(FirebaseService),
        auth = inject(AuthService),
        route = inject(RouteContextStore),
      ) => {
        /**
         * Chống gọi trùng: ba guard chạy nối tiếp trên một route chỉ nạp 1 lần.
         *
         * Để ngoài state vì đây là chi tiết điều phối, không phải dữ liệu — nhét
         * một Promise vào state là DevTools ghi lại thứ không tuần tự hoá được.
         */
        let loadPromise: Promise<void> | null = null;

        /** Trả true khi nạp xong, false khi hỏng — nơi gọi dựa vào đó để bỏ cache. */
        async function fetchFromServer(uid: string): Promise<boolean> {
          patchState(store, { status: 'loading', loading: true, lastError: null });
          try {
            // Hai request độc lập nhau, chạy song song cho nhanh.
            const [apiOrgs, apiInvites] = await Promise.all([
              api.get<ApiMyOrg[]>('/organizations'),
              api.get<ApiMyInvite[]>('/organizations/invites/me').catch(() => [] as ApiMyInvite[]),
            ]);

            // Backend không trả memberIds/ownerId trong GET /organizations mà giao
            // diện cần cả hai, nên lấy thêm — song song chứ không nối tiếp.
            const memberLists = await Promise.all(
              apiOrgs.map((o) =>
                api
                  .get<ApiOrgMember[]>('/organizations/' + o.id + '/members')
                  .catch(() => [] as ApiOrgMember[]),
              ),
            );

            const membersByOrg: Record<string, OrgMemberView[]> = {};
            const myRoleByOrg: Record<string, OrgRole> = {};
            const orgs: Organization[] = apiOrgs.map((o, i) => {
              membersByOrg[o.id] = memberLists[i].map(toOrgMemberView);
              myRoleByOrg[o.id] = o.role;
              return toOrganization(o, memberLists[i]);
            });

            patchState(store, setAllEntities(orgs), {
              membersByOrg,
              myRoleByOrg,
              myInvites: apiInvites.map((i) => toMyInvite(i, uid)),
              status: 'loaded',
              loading: false,
              lastError: null,
            });

            // Giữ lựa chọn cũ nếu tổ chức đó còn, không thì lấy cái đầu tiên.
            const saved = loadActiveOrgId(uid, orgs);
            const valid = orgs.some((o) => o.id === saved) ? saved : (orgs[0]?.id ?? null);
            route.setActiveOrg(valid);
            if (valid && valid !== saved) persistActiveOrgId(uid, valid);
            return true;
          } catch (e) {
            // KHÔNG xoá dữ liệu đang có: mất mạng chốc lát mà xoá sạch màn hình
            // thì tệ hơn là hiện dữ liệu hơi cũ kèm banner báo lỗi.
            patchState(store, {
              status: 'error',
              loading: false,
              lastError: loi(describeError(e, 'Không tải được danh sách tổ chức.')),
            });
            return false;
          }
        }

        /** Nạp rồi bỏ cache nếu hỏng, để lần gọi sau thử lại được (Luật 2). */
        function startLoad(uid: string): Promise<void> {
          patchState(store, { loadedForUid: uid });
          loadPromise = fetchFromServer(uid).then((ok) => {
            if (!ok) {
              patchState(store, { loadedForUid: null });
              loadPromise = null;
            }
          });
          return loadPromise;
        }

        return {
          /**
           * Bảo đảm dữ liệu đã nạp xong. Guard PHẢI await hàm này.
           *
           * ⚠️ Ba luật ở mục 4 tài liệu nằm hết trong hàm này, đừng "dọn gọn" đi:
           *
           *   1. Chưa có ID token thì KHÔNG đặt loadedForUid. AuthService khởi tạo
           *      từ localStorage nên có uid ngay, còn Firebase khôi phục phiên từ
           *      IndexedDB chậm hơn vài trăm mili-giây. Đánh dấu đã nạp lúc đó là
           *      cache lại một kết quả 401.
           *   2. Nạp hỏng thì xoá cờ (xem startLoad), nếu không mọi lần gọi sau đều
           *      trả lại đúng cái promise hỏng — không có đường nào ngoài F5.
           *   3. Lỗi phải nằm ở lastError cho guard đọc: rỗng vì lỗi mạng khác hẳn
           *      rỗng vì không thuộc tổ chức nào.
           */
          async ensureLoaded(): Promise<void> {
            const uid = auth.currentUser()?.id ?? null;
            if (!uid) return;
            if (store.loadedForUid() === uid && loadPromise) return loadPromise;

            // Chờ Firebase khôi phục phiên TRƯỚC khi quyết định làm gì.
            const token = await firebase.getIdToken();
            if (!token) {
              // Luật 1 — im lặng rút lui, KHÔNG đánh dấu đã nạp.
              patchState(store, { loadedForUid: null });
              loadPromise = null;
              return;
            }
            return startLoad(uid);
          },

          /** Ép nạp lại, bỏ qua cache. Gọi sau khi tạo/xoá/đổi dữ liệu. */
          async reload(): Promise<void> {
            const uid = auth.currentUser()?.id ?? null;
            if (!uid) return;
            return startLoad(uid);
          },

          /** Đăng xuất — dọn sạch, không để dữ liệu người trước sót lại cho người sau. */
          clearAll(): void {
            loadPromise = null;
            patchState(store, setAllEntities([] as Organization[]), initialOrganizationState);
            route.setActiveOrg(null);
          },

          /* ------------------------- đọc ------------------------- */

          membersOf(orgId: string | null): OrgMemberView[] {
            return orgId ? (store.membersByOrg()[orgId] ?? []) : [];
          },

          pendingInvitesFor(orgId: string): OrgInvite[] {
            return store.pendingByOrg()[orgId] ?? [];
          },

          /** Tra tổ chức theo slug trên URL. Null = không thuộc tổ chức đó, tức 404. */
          orgBySlug(slug: string): Organization | null {
            const clean = (slug || '').trim().toLowerCase();
            return store.entities().find((o) => (o.slug || '').toLowerCase() === clean) ?? null;
          },

          switchOrg(orgId: string): void {
            const uid = auth.currentUser()?.id;
            if (!uid || !store.entities().some((o) => o.id === orgId)) return;
            route.setActiveOrg(orgId);
            persistActiveOrgId(uid, orgId);
          },

          /* ------------------------- ghi ------------------------- */

          async createOrg(
            name: string,
            slug: string,
          ): Promise<{ org?: Organization; error?: string }> {
            try {
              const created = await api.post<ApiCreatedOrg>('/organizations', {
                name: name.trim(),
                slug: slug.trim(),
              });
              await this.reload();
              const org = store.entities().find((o) => o.id === created.id) ?? null;
              if (org) this.switchOrg(org.id);
              return { org: org ?? undefined };
            } catch (e) {
              return { error: describeError(e, 'Không tạo được tổ chức.') };
            }
          },

          async inviteMember(
            orgId: string,
            toUserId: string,
            role: OrgInviteRole = 'member',
          ): Promise<string | null> {
            const me = auth.currentUser();
            if (!me) return 'Bạn cần đăng nhập.';
            if (toUserId === me.id) return 'Bạn không thể tự mời chính mình.';
            try {
              // role chỉ có hiệu lực KHI người ta bấm Đồng ý — backend đọc lại
              // organization_invites.role lúc đó, không phải lúc gửi.
              await api.post('/organizations/' + orgId + '/invites', {
                toUserId: toUserId.trim(),
                role,
              });
              return null;
            } catch (e) {
              return describeError(e, 'Không gửi được lời mời.');
            }
          },

          async respondInvite(inviteId: string, accept: boolean): Promise<string | null> {
            try {
              await api.patch('/organizations/invites/' + inviteId, { accept });
              await this.reload();
              return null;
            } catch (e) {
              return describeError(e, 'Không trả lời được lời mời.');
            }
          },

          async removeMember(orgId: string, userId: string): Promise<string | null> {
            try {
              await api.delete('/organizations/' + orgId + '/members/' + userId);
              await this.reload();
              return null;
            } catch (e) {
              return describeError(e, 'Không xoá được thành viên.');
            }
          },

          async changeRole(orgId: string, userId: string, role: OrgRole): Promise<string | null> {
            try {
              await api.patch('/organizations/' + orgId + '/members/' + userId + '/role', { role });
              await this.reload();
              return null;
            } catch (e) {
              return describeError(e, 'Không đổi được vai trò.');
            }
          },

          /** Đổi tên tổ chức. slug KHÔNG đổi được — nó nằm trong mọi URL đã chia sẻ. */
          async updateOrg(orgId: string, changes: { name?: string }): Promise<string | null> {
            const name = changes.name?.trim();
            if (!name) return 'Tên tổ chức không được để trống.';
            try {
              await api.patch('/organizations/' + orgId, { name });
              await this.reload();
              return null;
            } catch (e) {
              return describeError(e, 'Không đổi được tên tổ chức.');
            }
          },

          /**
           * Xoá hẳn tổ chức (chỉ owner). Kéo theo toàn bộ workspace/board/thẻ
           * bên trong — backend cascade, không hoàn tác được.
           *
           * `reload()` sau khi xoá để danh sách tổ chức và tổ chức đang mở được
           * tính lại từ server, thay vì tự gỡ ở client rồi đoán xem nên nhảy đi đâu.
           */
          async deleteOrg(orgId: string): Promise<string | null> {
            try {
              await api.delete('/organizations/' + orgId);
              await this.reload();
              return null;
            } catch (e) {
              return describeError(e, 'Không xoá được tổ chức.');
            }
          },

          /** Lời mời đã gửi của 1 tổ chức (chỉ owner/admin gọi được). */
          async loadPendingInvites(orgId: string): Promise<void> {
            if (!orgId) return;
            try {
              const rows = await api.get<ApiPendingInvite[]>(
                '/organizations/' + orgId + '/invites',
              );
              patchState(store, {
                pendingByOrg: { ...store.pendingByOrg(), [orgId]: rows.map(toPendingInvite) },
              });
            } catch {
              // Thành viên thường gọi sẽ nhận 403 — không phải lỗi cần la lên,
              // modal đã ẩn khối đó rồi.
              patchState(store, { pendingByOrg: { ...store.pendingByOrg(), [orgId]: [] } });
            }
          },

          async cancelInvite(inviteId: string): Promise<string | null> {
            const orgId = route.activeOrgId();
            try {
              await api.delete('/organizations/invites/' + inviteId);
              if (orgId) await this.loadPendingInvites(orgId);
              return null;
            } catch (e) {
              return describeError(e, 'Không huỷ được lời mời.');
            }
          },

          /* ----------------- nhận từ WebSocket ------------------ */

          /**
           * Lời mời vừa tới qua WebSocket — KHÔNG gọi API.
           *
           * Sự kiện đã mang sẵn tên tổ chức và tên người mời nên vẽ được ngay;
           * gọi lại GET /organizations/invites/me chỉ để lấy hai cái tên đó là
           * thừa một vòng mạng, đúng lúc người dùng đang nhìn vào chuông.
           *
           * Chống trùng theo id: mở hai tab thì cả hai cùng nhận.
           */
          applyRemoteInvite(invite: OrgInvite): void {
            const all = store.myInvites();
            if (all.some((i) => i.id === invite.id)) return;
            patchState(store, { myInvites: [invite, ...all] });
          },

          /** Lời mời đã được trả lời ở nơi khác (tab khác) — bỏ khỏi chuông. */
          removeInviteLocally(inviteId: string): void {
            patchState(store, { myInvites: store.myInvites().filter((i) => i.id !== inviteId) });
          },

          /** Bị gỡ khỏi 1 tổ chức — nạp lại, tổ chức đó biến mất khỏi bộ chuyển. */
          async refreshAfterMembershipChange(): Promise<void> {
            await this.reload();
          },

          /**
           * Ai đó vừa đổi avatar / tên hiển thị — vá đúng người trong mọi tổ chức.
           *
           * `membersByOrg` là NGUỒN mà danh sách thành viên workspace, ô người
           * phụ trách, avatar trong board và trong chat đều đọc. Nó nạp một lần
           * lúc mở app rồi nằm im, nên không vá ở đây thì người khác vẫn thấy
           * ảnh cũ cho tới lần F5 kế tiếp — đúng lỗi đã báo.
           *
           * Chỉ ghi lại khi THỰC SỰ có thay đổi: `patchState` vô điều kiện là
           * mọi computed bám vào `membersByOrg` chạy lại, cho một sự kiện không
           * đổi gì.
           */
          applyRemoteProfile(p: {
            id: string;
            displayName: string | null;
            avatarUrl: string | null;
          }): void {
            const hienTai = store.membersByOrg();
            let coDoi = false;
            const moi: Record<string, OrgMemberView[]> = {};

            for (const [orgId, ds] of Object.entries(hienTai)) {
              moi[orgId] = ds.map((m) => {
                if (m.user.id !== p.id) return m;
                coDoi = true;
                return {
                  ...m,
                  user: {
                    ...m.user,
                    displayName: p.displayName ?? undefined,
                    avatarUrl: p.avatarUrl ?? undefined,
                  },
                };
              });
            }

            if (coDoi) patchState(store, { membersByOrg: moi });
          },

          /**
           * Một tổ chức vừa đổi ở nơi khác — upsert chứ KHÔNG add.
           *
           * Sự kiện WebSocket thường tới TRƯỚC khi phản hồi HTTP về (xem mục 3
           * tài liệu), nên "thêm mới" là phần tử vào state hai lần.
           */
          applyRemoteOrg(org: Organization): void {
            patchState(store, upsertEntity(org));
          },
        };
      },
    ),
  );
}
