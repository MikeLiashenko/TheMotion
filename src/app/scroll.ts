import Lenis from 'lenis';
import { stopProgress, TOTAL_VH } from './timeline';

/** Turns page scrolling into a smoothed 0..1 progress through the journey. */
export class ScrollDriver {
  private readonly lenis: Lenis;
  /** A trip asked for before the page had been laid out (it has no height while the tab is hidden). */
  private pending: { stopIndex: number; immediate: boolean } | null = null;

  constructor(spacer: HTMLElement) {
    // The page is exactly as tall as the journey is long, plus one screen to scroll within.
    spacer.style.height = `${TOTAL_VH + 100}vh`;
    this.lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.8, touchMultiplier: 1.4 });
  }

  get progress(): number {
    const limit = this.lenis.limit;
    return limit > 0 ? Math.min(1, Math.max(0, this.lenis.scroll / limit)) : 0;
  }

  update(timeMs: number): void {
    if (this.pending && this.lenis.limit > 0) {
      const { stopIndex, immediate } = this.pending;
      this.goTo(stopIndex, immediate);
    }
    this.lenis.raf(timeMs);
  }

  /** Travel to a stop. Long trips take longer, but never drag. */
  goTo(stopIndex: number, immediate = false): void {
    if (this.lenis.limit <= 0) {
      this.pending = { stopIndex, immediate };
      return;
    }
    this.pending = null;
    const target = stopProgress(stopIndex) * this.lenis.limit;
    const distance = Math.abs(target - this.lenis.scroll) / window.innerHeight;
    this.lenis.scrollTo(target, {
      immediate,
      duration: Math.min(6, 1.2 + distance * 0.12),
      easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
    });
  }
}
