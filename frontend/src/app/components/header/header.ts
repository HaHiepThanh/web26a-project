import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { WorkspaceUiService } from '../../services/workspace-ui.service';
import { CardService } from '../../services/card.service';

/** Top navbar shared by every page inside app-layout (ported from trello-workspace prototype). */
@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly auth = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly workspaceUi = inject(WorkspaceUiService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly cardService = inject(CardService);

  readonly currentUser = this.auth.currentUser;
  readonly theme = this.themeService.theme;
  readonly menuOpen = signal(false);
  readonly createMenuOpen = signal(false);

  /** Nhắc hạn Mức 1 (#10): đếm thẻ của "tôi" quá hạn/sắp đến hạn ở board vừa mở gần
   *  nhất (CardService là singleton, còn dữ liệu ngay cả khi rời board qua trang khác). */
  readonly dueBadgeCount = computed(() => {
    const c = this.cardService.myDueCounts();
    return c.overdue + c.dueSoon;
  });

  readonly initials = computed(() => {
    const user = this.currentUser();
    const name = user?.displayName ?? user?.email ?? '?';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '?';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
      this.createMenuOpen.set(false);
    }
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  toggleUserMenu(): void {
    this.createMenuOpen.set(false);
    this.menuOpen.update((v) => !v);
  }

  toggleCreateMenu(): void {
    this.menuOpen.set(false);
    this.createMenuOpen.update((v) => !v);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.workspaceUi.setSearchQuery(value);
  }

  requestCreateBoard(): void {
    this.createMenuOpen.set(false);
    this.workspaceUi.requestCreateBoard();
    void this.router.navigateByUrl('/workspace');
  }

  requestCreateWorkspace(): void {
    this.createMenuOpen.set(false);
    this.workspaceUi.requestCreateWorkspace();
    void this.router.navigateByUrl('/workspace');
  }


  readonly copiedUuid = signal(false);

  copyUuid(): void {
    const uid = this.currentUser()?.id;
    if (!uid) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(uid);
      this.copiedUuid.set(true);
      setTimeout(() => this.copiedUuid.set(false), 2500);
    }
  }

  async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}

