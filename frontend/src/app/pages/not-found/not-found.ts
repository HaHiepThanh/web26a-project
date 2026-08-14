import { Component, HostListener, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Star {
  top: string;
  left: string;
  size: number;
  delay: string;
  duration: string;
}

function makeStars(count: number): Star[] {
  return Array.from({ length: count }, (_, i) => ({
    top: `${Math.round((i * 37 + 11) % 100)}%`,
    left: `${Math.round((i * 53 + 7) % 100)}%`,
    size: i % 3 === 0 ? 3 : 2,
    delay: `${(i * 0.37) % 4}s`,
    duration: `${3 + (i % 4)}s`,
  }));
}

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.css',
})
export class NotFound {
  readonly path = window.location.pathname;
  readonly stars = makeStars(18);

  /** Chuột di chuyển → hiệu ứng parallax nhẹ cho la bàn/glow/watermark 404. */
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private readonly tiltX = signal(0); // -0.5..0.5
  private readonly tiltY = signal(0);

  readonly compassTransform = computed(() => `translate(${this.tiltX() * 18}px, ${this.tiltY() * 18}px)`);
  readonly glowTransform = computed(() => `translate(${this.tiltX() * -14}px, ${this.tiltY() * -14}px)`);
  readonly giantCodeTransform = computed(() => `translate(${this.tiltX() * 10}px, ${this.tiltY() * 10}px)`);

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.reducedMotion) return;
    this.tiltX.set(event.clientX / window.innerWidth - 0.5);
    this.tiltY.set(event.clientY / window.innerHeight - 0.5);
  }
}
