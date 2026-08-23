import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideBrainCircuit,
  LucideCheck,
  LucideChevronRight,
  LucideClock,
  LucideCode,
  LucideListFilter,
  LucideMenu,
  LucideRefreshCw,
  LucideShieldCheck,
  LucideSparkles,
  LucideUsers,
  LucideWebhook,
  LucideX,
} from '@lucide/angular';

/** GitHub repo hiện tại của dự án (đọc từ `git remote -v`) — dùng cho nút "View Codebase" trong hero và link ở footer. */
const REPO_URL = 'https://github.com/HaHiepThanh/web26a-project';

interface ArchitectureLevel {
  label: string;
  hint: string;
}

/** Trạng thái của khối "AI Card Suggestion" minh hoạ — bấm Confirm/Dismiss có phản hồi
 *  thật thay vì im lặng (audit UI-016), dù đây chỉ là minh hoạ tĩnh, không tạo card thật. */
type AiSuggestionState = 'pending' | 'confirmed' | 'dismissed';

/**
 * Trang landing marketing cho "Horizon Hub Harmony" — hoàn toàn tách biệt khỏi
 * /login và /register. Các nút Sign In / Sign Up chỉ ĐIỀU HƯỚNG sang hai trang
 * đó qua routerLink, không xử lý auth ở đây.
 */
@Component({
  selector: 'app-landing',
  imports: [
    RouterLink,
    LucideArrowRight,
    LucideBrainCircuit,
    LucideCheck,
    LucideChevronRight,
    LucideClock,
    LucideCode,
    LucideListFilter,
    LucideMenu,
    LucideRefreshCw,
    LucideShieldCheck,
    LucideSparkles,
    LucideUsers,
    LucideWebhook,
    LucideX,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  readonly repoUrl = REPO_URL;
  readonly mobileMenuOpen = signal(false);

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  readonly navLinks: { label: string; href: string }[] = [
    { label: 'Features', href: '#features' },
    { label: 'AI Assistant', href: '#ai-assistant' },
    { label: 'Architecture', href: '#architecture' },
  ];

  readonly architecture: ArchitectureLevel[] = [
    { label: 'Organization', hint: 'Top-level tenant' },
    { label: 'Workspace', hint: 'Team or department' },
    { label: 'Board', hint: 'A project' },
    { label: 'List', hint: 'A workflow stage' },
    { label: 'Card', hint: 'A unit of work' },
  ];

  /** Khối gợi ý trong mockup board (cột "In Progress"). */
  readonly heroAiState = signal<AiSuggestionState>('pending');
  /** Khối gợi ý trong section "AI Assistant". Tách signal riêng vì 2 minh hoạ độc lập nhau. */
  readonly assistantAiState = signal<AiSuggestionState>('pending');
}
