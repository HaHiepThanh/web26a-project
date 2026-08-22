import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import {
  LucideActivity,
  LucideArrowRight,
  LucideFolderKanban,
  LucideKanban,
  LucideListChecks,
  LucideMenu,
  LucideShieldCheck,
  LucideUsers,
  LucideX,
  LucideZap,
} from '@lucide/angular';

/**
 * Landing page công khai (marketing) — tách khỏi auth-layout/app-layout vì cần
 * chrome riêng (navbar trong suốt cuộn theo trang, hero full-bleed), không dùng
 * Header/Footer của app (những component đó giả định đã đăng nhập).
 */
@Component({
  selector: 'app-landing',
  imports: [
    RouterLink,
    LucideActivity,
    LucideArrowRight,
    LucideFolderKanban,
    LucideKanban,
    LucideListChecks,
    LucideMenu,
    LucideShieldCheck,
    LucideUsers,
    LucideX,
    LucideZap,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing implements OnInit, AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly title = inject(Title);

  readonly mobileMenuOpen = signal(false);
  readonly scrolled = signal(false);

  private revealObserver: IntersectionObserver | null = null;

  ngOnInit(): void {
    this.title.setTitle('HHH — Horizon Hub Harmony');
    // Cuộn mượt khi bấm anchor (#features, #how-it-works). Đặt trên <html> vì
    // style component (Emulated encapsulation) không với ra ngoài host được;
    // trả lại rỗng lúc rời trang để không ảnh hưởng các route khác.
    document.documentElement.style.scrollBehavior = 'smooth';
  }

  ngAfterViewInit(): void {
    // Scroll-reveal nhẹ bằng IntersectionObserver — không kéo thêm thư viện.
    // Mỗi phần tử .reveal chỉ chạy animation một lần rồi ngừng quan sát.
    const items: NodeListOf<HTMLElement> = this.host.nativeElement.querySelectorAll('.reveal');
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('in-view');
          this.revealObserver?.unobserve(entry.target);
        }
      },
      { threshold: 0.15 },
    );
    items.forEach((el) => this.revealObserver?.observe(el));
  }

  ngOnDestroy(): void {
    document.documentElement.style.scrollBehavior = '';
    this.revealObserver?.disconnect();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled.set(window.scrollY > 8);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }
}
