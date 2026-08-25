import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarColorFor, initialsOf } from '../../../../utils/avatar.util';
import { BoardStore } from '../../../../ngrx/board/board.store';
import { ManageWorkspaceStore } from '../../../../ngrx/manage-workspace/manage-workspace.store';
import { OrganizationStore } from '../../../../ngrx/organization/organization.store';
import { WorkspaceService } from '../../../../services/workspace.service';
import { ProjectSummary, roleBadge, roleLabel } from '../manage-workspace.models';

/**
 * Màn 1 — các project (board) mà tài khoản đang đăng nhập tham gia.
 *
 * Không có endpoint "board của tôi" gộp sẵn, nên phải đi ba chặng: workspace của
 * tổ chức đang chọn → board của từng workspace → thành viên của từng board.
 * Backend đã lọc theo quyền ở mọi chặng (`GET /boards` chỉ trả board mình vào
 * được), nên ở đây không lọc lại — lọc lần hai bằng dữ liệu client chỉ tạo cơ hội
 * hiển thị sai.
 */
@Component({
  selector: 'app-project-list',
  imports: [RouterLink],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
})
export class ProjectList {
  private readonly orgs = inject(OrganizationStore);
  private readonly boards = inject(BoardStore);
  private readonly workspaces = inject(WorkspaceService);
  private readonly boardMembers = inject(ManageWorkspaceStore);

  readonly roleLabel = roleLabel;
  readonly roleBadge = roleBadge;
  readonly avatarColorFor = avatarColorFor;
  readonly initialsOf = initialsOf;

  readonly searchQuery = signal('');
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  constructor() {
    // `activeOrgId` do guard đặt (xem `onboarding.guard.ts`) và đổi khi người
    // dùng chuyển tổ chức — nạp lại theo nó. `untracked` để phần thân không vô
    // tình theo dõi thêm signal nào rồi tự gọi lại chính mình.
    effect(() => {
      const orgId = this.orgs.activeOrgId();
      untracked(() => void this.bootstrap(orgId));
    });
  }

  private async bootstrap(orgId: string | null): Promise<void> {
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);

    await this.workspaces.loadWorkspaces(orgId);
    const workspaceIds = this.workspaces.workspaces().map((w) => w.id);
    await this.boards.loadAllBoards(workspaceIds);
    await this.boardMembers.loadManyBoardMembers(this.boards.allBoards().map((b) => b.id));

    this.loadError.set(
      this.workspaces.loadError() ?? this.boardMembers.lastError()?.message ?? null,
    );
    this.loading.set(false);
  }

  /** Vai trò giống nhau ở mọi board của cùng một tổ chức — xem chú thích đầu
   *  `manage-workspace.models.ts`. Đọc một lần rồi gắn vào từng thẻ. */
  private readonly workspaceNames = computed(() => {
    const map: Record<string, string> = {};
    for (const w of this.workspaces.workspaces()) map[w.id] = w.name;
    return map;
  });

  readonly projects = computed<ProjectSummary[]>(() => {
    const names = this.workspaceNames();
    const myRole = this.orgs.myRole();
    return this.boards.allBoards().map((board) => {
      const members = this.boardMembers.membersOf(board.id);
      return {
        id: board.id,
        name: board.name,
        workspaceName: names[board.workspaceId] ?? 'Unknown workspace',
        myRole,
        memberCount: members.length,
        memberPreview: members.slice(0, 4).map((m) => ({
          userId: m.userId,
          name: m.user?.displayName || m.user?.email || m.userId,
          avatarUrl: m.user?.avatarUrl ?? null,
        })),
      };
    });
  });

  readonly filteredProjects = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.projects();
    return this.projects().filter(
      (p) => p.name.toLowerCase().includes(q) || p.workspaceName.toLowerCase().includes(q),
    );
  });

  trackById = (_: number, item: ProjectSummary) => item.id;
}
