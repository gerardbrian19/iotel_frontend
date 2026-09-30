import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';

interface Slide {
  src: string;
  alt: string;
}

/** Shown in this order. Remote images; `referrerpolicy="no-referrer"` keeps hotlink protection from blocking them. */
const SLIDES: readonly Slide[] = [
  {
    src: 'https://down-ph.img.susercontent.com/file/ph-11134207-7r98z-lvjye3ly949d92',
    alt: 'Handheld dual-band two-way radio with its key features',
  },
  {
    src: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSDvM3CC_ZuOBRcvg5VK-nSNiUTAOsg1B9ei5aiLV8tGGYjyXM_bwg06y7j&s=10',
    alt: 'Two multi-band handheld radios with flashlight and USB-C charging',
  },
  {
    src: 'https://www.atlanticradiocorp.com/cdn/shop/articles/AtlanticRadioCommunicationsCorp-388481-Purchasing-Used-Radio-Blogbanner2_42ffc6d3-caf6-48d8-8f1e-2854e6785e0a.jpg?v=1778528684&width=1920',
    alt: 'Three professional digital two-way radios',
  },
];

const INTERVAL_MS = 5000;
/** Horizontal finger movement (px) that counts as a swipe. */
const SWIPE_PX = 40;

/**
 * The landing page's hero: IOTEL's welcome text next to an automatic image slideshow (every 5 s, crossfade), with
 * arrows, dots, keyboard arrows and swipe. Auto-advance pauses while the pointer is over it or focus is inside it,
 * and restarts its 5 s after every manual change.
 */
@Component({
  selector: 'app-hero-slideshow',
  standalone: true,
  imports: [RouterLink, NzIconModule],
  templateUrl: './hero-slideshow.component.html',
  styleUrl: './hero-slideshow.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroSlideshowComponent {
  protected readonly slides = SLIDES;
  protected readonly current = signal(0);
  protected readonly hovered = signal(false);
  protected readonly focused = signal(false);
  protected readonly paused = computed(() => this.hovered() || this.focused());

  private touchStartX: number | null = null;

  constructor() {
    // Re-armed whenever the slide changes or the pause state flips, so a manual change gets a full 5 s too.
    effect((onCleanup) => {
      this.current();
      if (this.paused()) return;
      const timer = setTimeout(() => this.next(), INTERVAL_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected goTo(index: number): void {
    const n = this.slides.length;
    this.current.set(((index % n) + n) % n);
  }

  protected next(): void {
    this.goTo(this.current() + 1);
  }

  protected prev(): void {
    this.goTo(this.current() - 1);
  }

  protected onFocusOut(event: FocusEvent): void {
    const target = event.currentTarget as HTMLElement;
    if (!target.contains(event.relatedTarget as Node | null)) this.focused.set(false);
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0]?.clientX ?? null;
  }

  protected onTouchEnd(event: TouchEvent): void {
    const endX = event.changedTouches[0]?.clientX;
    if (this.touchStartX === null || endX === undefined) return;
    const dx = endX - this.touchStartX;
    this.touchStartX = null;
    if (Math.abs(dx) < SWIPE_PX) return;
    if (dx < 0) this.next();
    else this.prev();
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
