import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { BOARD_BACKGROUNDS, BoardBackground, User } from '../../../models';
import { WorkspaceItem, WorkspaceMember, avatarBgFor, initialsOf } from '../../../mocks';

@Component({
  selector: 'app-workspace-form-modal',
  imports: [FormsModule],
  templateUrl: './workspace-form-modal.html',
})
export class WorkspaceFormModal {
  private readonly auth = inject(AuthService);

  readonly isOpen = input<boolean>(false);
  readonly mode = input<'create' | 'edit'>('create');
  readonly workspace = input<WorkspaceItem | null>(null);
  readonly currentUser = input<User | null>(null);

  readonly close = output<void>();
  readonly save = output<{
    name: string;
    icon: string;
    iconBg: BoardBackground;
    description: string;
    members: WorkspaceMember[];
  }>();
  readonly delete = output<string>();

  readonly nameInput = signal('');
  readonly nameError = signal<string | null>(null);
  readonly iconInput = signal('📂');
  readonly iconBgInput = signal<BoardBackground>('bg-board-blue');
  readonly descInput = signal('');
  readonly members = signal<WorkspaceMember[]>([]);
  readonly deleteConfirmArmed = signal(false);

  readonly uuidSearchInput = signal('');
  readonly searchDropdownOpen = signal(false);

  readonly bgClasses = BOARD_BACKGROUNDS;
  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;

  readonly iconCategories = [
    {
      name: '💼 Dự án',
      icons: ['📂', '📁', '🚀', '🎯', '⚡', '🔥', '📊', '📈', '🏢', '🏗️', '📋', '💼', '📌', '🏷️'],
    },
    {
      name: '💻 Công nghệ',
      icons: ['💻', '⚙️', '🛠️', '🤖', '🔒', '🌐', '🎮', '📱', '🕹️', '🧪', '🧬', '🖥️', '⌨️', '🛰️'],
    },
    {
      name: '🎓 Học tập',
      icons: ['🎓', '📚', '✏️', '📖', '💡', '🧠', '🔬', '📝', '🏫', '📐', '🏅', '🏆', '🎨', '🖌️'],
    },
    {
      name: '✨ Sáng tạo',
      icons: ['✨', '💎', '🌟', '☕', '🍀', '🌈', '🍕', '🎉', '✈️', '🎵', '❤️', '🏖️', '🌍', '⛺'],
    },
  ];
  readonly selectedIconCategory = signal<number>(0);

  readonly searchResults = computed(() => {
    const q = this.uuidSearchInput().trim().toLowerCase();
    if (!q) return [];
    const all = this.auth.getSearchableUsers();
    const currentMemberIds = new Set(this.members().map((m) => m.id.toLowerCase()));
    return all.filter(
      (u) =>
        !currentMemberIds.has(u.id.toLowerCase()) &&
        (u.id.toLowerCase().includes(q) ||
          (u.displayName && u.displayName.toLowerCase().includes(q)) ||
          u.email.toLowerCase().includes(q)),
    );
  });

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        const ws = this.workspace();
        const m = this.mode();
        this.nameError.set(null);
        this.deleteConfirmArmed.set(false);
        this.uuidSearchInput.set('');
        this.searchDropdownOpen.set(false);
        this.selectedIconCategory.set(0);

        if (m === 'edit' && ws) {
          this.nameInput.set(ws.name);
          this.iconInput.set(ws.icon);
          this.iconBgInput.set(ws.iconBg || 'bg-board-blue');
          this.descInput.set(ws.description);
          this.members.set([...(ws.members || [])]);
        } else {
          this.nameInput.set('');
          this.iconInput.set('📂');
          this.iconBgInput.set('bg-board-blue');
          this.descInput.set('');

          const cur = this.currentUser();
          const owner: WorkspaceMember = cur
            ? {
                id: cur.id,
                displayName: cur.displayName || cur.email.split('@')[0] || 'Bạn',
                email: cur.email,
                role: 'owner',
              }
            : {
                id: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40',
                displayName: 'Nguyễn Văn Nam',
                email: 'nam.nguyen@trello.dev',
                role: 'owner',
              };
          this.members.set([owner]);
        }
      }
    });
  }

  addMember(user: User): void {
    const mems = this.members();
    if (mems.some((m) => m.id.toLowerCase() === user.id.toLowerCase())) return;

    const newMember: WorkspaceMember = {
      id: user.id,
      displayName: user.displayName || user.email.split('@')[0],
      email: user.email,
      role: 'member',
      avatarUrl: user.avatarUrl,
    };
    this.members.update((list) => [...list, newMember]);
    this.uuidSearchInput.set('');
    this.searchDropdownOpen.set(false);
  }

  addMemberByInput(): void {
    const input = this.uuidSearchInput().trim();
    if (!input) return;

    const found = this.auth.findUserByUuid(input) ?? this.auth.getSearchableUsers().find(
      (u) => u.email.toLowerCase() === input.toLowerCase() || (u.displayName && u.displayName.toLowerCase() === input.toLowerCase()),
    );

    if (found) {
      this.addMember(found);
      return;
    }

    const mems = this.members();
    if (mems.some((m) => m.id.toLowerCase() === input.toLowerCase())) return;

    const shortId = input.length > 8 ? input.slice(0, 8) : input;
    const isEmail = input.includes('@');
    const newMember: WorkspaceMember = {
      id: input,
      displayName: isEmail ? input.split('@')[0] : `User-${shortId}`,
      email: isEmail ? input : `${shortId}@trello.dev`,
      role: 'member',
    };
    this.members.update((list) => [...list, newMember]);
    this.uuidSearchInput.set('');
    this.searchDropdownOpen.set(false);
  }

  removeMember(memberId: string): void {
    const mem = this.members().find((m) => m.id === memberId);
    if (mem?.role === 'owner') return;
    this.members.update((list) => list.filter((m) => m.id !== memberId));
  }

  onSubmit(): void {
    const name = this.nameInput().trim();
    if (!name) {
      this.nameError.set('Vui lòng nhập tên Không gian làm việc!');
      return;
    }
    if (name.length > 50) {
      this.nameError.set('Tên Không gian làm việc tối đa 50 ký tự!');
      return;
    }
    this.nameError.set(null);

    this.save.emit({
      name,
      icon: this.iconInput().trim() || '📂',
      iconBg: this.iconBgInput(),
      description: this.descInput().trim(),
      members: this.members(),
    });
  }

  confirmDelete(): void {
    if (!this.deleteConfirmArmed()) {
      this.deleteConfirmArmed.set(true);
      return;
    }
    const ws = this.workspace();
    if (ws) {
      this.delete.emit(ws.id);
    }
  }
}
