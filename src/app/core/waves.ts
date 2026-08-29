import {
  Component, ElementRef, Input, ViewChild, AfterViewInit, OnDestroy,
  inject, ChangeDetectionStrategy,
} from '@angular/core';

/* ===========================================================================
   Neon waves — the ambient backdrop for a section.
   ---------------------------------------------------------------------------
   A stack of drifting sine bands in the plasma ramp, each with a soft bloom
   pass under a thin bright core. Drawn rather than photographed: a neon wave
   is pure gradient and curve, so a canvas gets closer to the intended look
   than any stock image would, at about 3 KB and at whatever resolution the
   display happens to be.

   Sits behind content and never hit-tests. Parked when off screen or the tab
   is hidden. Under prefers-reduced-motion it paints one still frame and stops.
   =========================================================================== */

const VIOLET = [139, 92, 246];
const CYAN   = [34, 211, 238];
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ramp = (t: number, a: number) => {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return `rgba(${Math.round(lerp(VIOLET[0], CYAN[0], k))},`
       + `${Math.round(lerp(VIOLET[1], CYAN[1], k))},`
       + `${Math.round(lerp(VIOLET[2], CYAN[2], k))},${a})`;
};

interface Band { k: number; amp: number; freq: number; phase: number; speed: number; y: number; w: number; }

@Component({
  selector: 'ax-waves',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #cv class="wv" aria-hidden="true"></canvas>`,
  styles: [`
    :host { position:absolute; inset:0; display:block; z-index:0; pointer-events:none; overflow:hidden; }
    .wv { width:100%; height:100%; display:block; }
  `],
})
export class Waves implements AfterViewInit, OnDestroy {
  /** How many bands. Six reads as a field; more turns to mush at small heights. */
  @Input() count = 6;
  /** Overall opacity. Backdrops want this low — the content has to win. */
  @Input() intensity = 0.55;
  /** Vertical spread of the stack, as a fraction of height. */
  @Input() spread = 0.62;

  private host = inject(ElementRef<HTMLElement>);
  @ViewChild('cv') cvRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private W = 0; private H = 0;
  private bands: Band[] = [];
  private raf = 0;
  private onScreen = true;
  private io?: IntersectionObserver;
  private ro?: ResizeObserver;

  private readonly reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  ngAfterViewInit() {
    const ctx = this.cvRef.nativeElement.getContext('2d');
    if (!ctx) return;
    this.ctx = ctx;
    this.measure();
    this.paint(0);                       // never blank, even if rAF never runs

    this.ro = new ResizeObserver(() => { this.measure(); this.paint(this.lastT); });
    this.ro.observe(this.host.nativeElement);

    if (this.reduced) return;

    this.io = new IntersectionObserver(
      e => { this.onScreen = e[0]?.isIntersecting ?? true; }, { threshold: 0 });
    this.io.observe(this.host.nativeElement);
    document.addEventListener('visibilitychange', this.onVis);
    this.raf = requestAnimationFrame(this.frame);
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.ro?.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
  }

  private onVis = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else this.raf = requestAnimationFrame(this.frame);
  };

  private lastT = 0;
  private frame = (t: number) => {
    if (this.onScreen) this.paint(t);
    this.raf = requestAnimationFrame(this.frame);
  };

  private measure() {
    const el = this.host.nativeElement;
    const cv = this.cvRef.nativeElement;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = el.clientWidth || 1;
    this.H = el.clientHeight || 1;
    cv.width = Math.round(this.W * dpr);
    cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = Math.max(2, this.count);
    this.bands = Array.from({ length: n }, (_, i) => {
      const k = i / (n - 1);
      return {
        k,                                             // position on the plasma ramp
        amp: this.H * (0.05 + 0.055 * (1 - k)),
        freq: (1.1 + k * 1.5) / Math.max(320, this.W), // longer waves at the violet end
        phase: i * 1.7,
        speed: 0.00016 + i * 0.000042,
        y: this.H * (0.5 - this.spread / 2 + this.spread * k),
        w: 1.4 + (1 - k) * 1.1,
      };
    });
  }

  private paint(t: number) {
    const ctx = this.ctx, W = this.W, H = this.H;
    if (!ctx || !this.bands.length) return;
    this.lastT = t;
    ctx.clearRect(0, 0, W, H);

    const step = Math.max(6, Math.round(W / 140));
    ctx.globalCompositeOperation = 'lighter';

    for (const b of this.bands) {
      const phase = b.phase + (this.reduced ? 0 : t * b.speed);
      // Two passes: a wide soft bloom, then a thin bright core on top.
      for (const [width, alpha] of [[b.w * 9, 0.055], [b.w, 0.62]] as const) {
        ctx.lineWidth = width;
        ctx.strokeStyle = ramp(b.k, alpha * this.intensity);
        ctx.beginPath();
        for (let x = -step; x <= W + step; x += step) {
          // Two summed sines so the crest never lands in the same place twice.
          const y = b.y
            + Math.sin(x * b.freq + phase) * b.amp
            + Math.sin(x * b.freq * 2.3 - phase * 0.7) * b.amp * 0.32;
          x === -step ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    // Fade the edges so the bands do not end in a hard vertical cut.
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(6,7,11,.95)');
    g.addColorStop(0.18, 'rgba(6,7,11,0)');
    g.addColorStop(0.82, 'rgba(6,7,11,0)');
    g.addColorStop(1, 'rgba(6,7,11,.95)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(6,7,11,.9)');
    v.addColorStop(0.42, 'rgba(6,7,11,0)');
    v.addColorStop(0.58, 'rgba(6,7,11,0)');
    v.addColorStop(1, 'rgba(6,7,11,.9)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
}
