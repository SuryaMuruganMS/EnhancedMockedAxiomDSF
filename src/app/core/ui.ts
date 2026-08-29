import {
  Component, Directive, ElementRef, HostListener, inject,
  AfterViewInit, OnDestroy, Input, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * The animated ambient field. Mounted once, behind everything.
 * Three drifting plasma blooms, a grain plate, and a masked lattice — all
 * CSS-driven so there is no rAF loop competing with the app.
 */
@Component({
  selector: 'ax-field',
  standalone: true,
  template: `
    <div class="ax-field" aria-hidden="true">
      <div class="ax-bloom ax-bloom--1"></div>
      <div class="ax-bloom ax-bloom--2"></div>
      <div class="ax-bloom ax-bloom--3"></div>
      <div class="ax-lattice"></div>
      <div class="ax-grain"></div>
    </div>
  `,
})
export class AmbientField {}

/**
 * Feeds cursor position into --mx/--my so `.glass--live` and `.glass--spot`
 * can light the rim and interior where the pointer actually is.
 *
 * Reads offsetX/offsetY rather than calling getBoundingClientRect on every
 * move, so a grid of these does not thrash layout.
 */
@Directive({ selector: '[axSpot]', standalone: true })
export class SpotDirective {
  private el = inject(ElementRef<HTMLElement>);

  @HostListener('pointermove', ['$event'])
  onMove(e: PointerEvent) {
    const n = this.el.nativeElement;
    n.style.setProperty('--mx', `${e.offsetX}px`);
    n.style.setProperty('--my', `${e.offsetY}px`);
  }
}

/**
 * Adds .seen to descendants marked .reveal as they scroll into view.
 * Unobserves after firing so scrolling back up does not re-animate.
 *
 * The hidden state lives behind [data-reveal] in the stylesheet and this
 * directive is what stamps that attribute, so content is only ever hidden once
 * something is definitely going to reveal it. If IntersectionObserver is
 * missing the attribute is never set and everything renders plainly.
 */
@Directive({ selector: '[axReveal]', standalone: true })
export class RevealDirective implements AfterViewInit, OnDestroy {
  private host = inject(ElementRef<HTMLElement>);
  private io?: IntersectionObserver;
  private fired = false;
  private guard = 0;

  ngAfterViewInit() {
    const root = this.host.nativeElement;
    const targets = root.querySelectorAll('.reveal');
    if (!targets.length || typeof IntersectionObserver === 'undefined') return;

    root.setAttribute('data-reveal', '');
    this.io = new IntersectionObserver(entries => {
      this.fired = true;
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('seen'); this.io!.unobserve(e.target); }
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
    targets.forEach(t => this.io!.observe(t));

    // A live observer always reports on the elements already in the viewport,
    // on the first frame after observe(). If nothing has come back by now the
    // observer is not going to work here — a prerender, a tab that was never
    // painted, an embedded view — and leaving the page at opacity 0 would hide
    // the content for good. Drop the stamp and show everything, unanimated.
    this.guard = setTimeout(() => {
      if (this.fired) return;
      this.io?.disconnect();
      root.removeAttribute('data-reveal');
    }, 1200) as unknown as number;
  }

  ngOnDestroy() { clearTimeout(this.guard); this.io?.disconnect(); }
}

/**
 * Counts a number up when it first appears. Used on console metrics so the
 * page has a beat on load without a library.
 */
@Component({
  selector: 'ax-count',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="mono">{{ shown }}{{ suffix }}</span>`,
})
export class CountUp implements AfterViewInit, OnDestroy {
  @Input() value = 0;
  @Input() suffix = '';
  shown = 0;
  private raf = 0;
  private io?: IntersectionObserver;
  private el = inject(ElementRef<HTMLElement>);

  ngAfterViewInit() {
    this.io = new IntersectionObserver(e => {
      if (e[0]?.isIntersecting) { this.run(); this.io?.disconnect(); }
    }, { threshold: 0.4 });
    this.io.observe(this.el.nativeElement);
  }

  private run() {
    const target = this.value;
    if (!target) { this.shown = 0; return; }
    const t0 = performance.now();
    const dur = 900;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      // easeOutExpo — fast start, long settle.
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      this.shown = Math.round(target * e);
      if (p < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  ngOnDestroy() { cancelAnimationFrame(this.raf); this.io?.disconnect(); }
}

/** Inline sparkline. Values are normalised; the last point is emphasised. */
@Component({
  selector: 'ax-spark',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" preserveAspectRatio="none" class="spark">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--plasma-a)" stop-opacity=".34"/>
          <stop offset="100%" stop-color="var(--plasma-a)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path [attr.d]="area" [attr.fill]="'url(#' + gid + ')'"/>
      <path [attr.d]="line" fill="none" stroke="var(--plasma-b)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      <circle [attr.cx]="lastX" [attr.cy]="lastY" r="2.4" fill="var(--plasma-b)"/>
    </svg>
  `,
  styles: [`.spark { width:100%; height:34px; display:block; }`],
})
export class Spark {
  @Input() set data(v: number[]) { this.build(v ?? []); }
  w = 100; h = 34;
  line = ''; area = ''; lastX = 0; lastY = 0;
  gid = 'sp' + Math.floor(performance.now() * 1000) % 100000;

  private build(v: number[]) {
    if (v.length < 2) { this.line = this.area = ''; return; }
    const max = Math.max(...v), min = Math.min(...v);
    const span = max - min || 1;
    const pts = v.map((n, i) => [
      (i / (v.length - 1)) * this.w,
      this.h - 3 - ((n - min) / span) * (this.h - 6),
    ] as const);
    this.line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
    this.area = `${this.line} L${this.w} ${this.h} L0 ${this.h} Z`;
    this.lastX = pts[pts.length - 1][0];
    this.lastY = pts[pts.length - 1][1];
  }
}

/* ===========================================================================
   Interaction directives
   ---------------------------------------------------------------------------
   Each one writes a CSS custom property and lets the stylesheet own the
   transition, so motion stays interruptible and nothing here runs a rAF loop
   per element. Every directive checks prefers-reduced-motion once at
   construction and becomes inert when it is set.
   =========================================================================== */

const REDUCED = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True only for a real pointer. Touch reports a phantom hover on tap. */
const FINE = () =>
  typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Tilts a card toward the cursor.
 *
 * Writes --rx/--ry consumed by `.tilt`. Max deflection is deliberately small:
 * past about 8° the text on the face starts to read as distorted rather than
 * as depth.
 */
@Directive({ selector: '[axTilt]', standalone: true })
export class TiltDirective {
  private el = inject(ElementRef<HTMLElement>);
  /** Maximum rotation in degrees on either axis. */
  @Input() axTilt: number | string = 7;

  private get max() { return Number(this.axTilt) || 7; }
  private off = REDUCED() || !FINE();

  @HostListener('pointermove', ['$event'])
  move(e: PointerEvent) {
    if (this.off) return;
    const n = this.el.nativeElement;
    const r = n.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width  - 0.5;
    const py = (e.clientY - r.top)  / r.height - 0.5;
    n.style.setProperty('--ry', `${( px * this.max * 2).toFixed(2)}deg`);
    n.style.setProperty('--rx', `${(-py * this.max * 2).toFixed(2)}deg`);
  }

  @HostListener('pointerleave')
  leave() {
    const n = this.el.nativeElement;
    n.style.setProperty('--rx', '0deg');
    n.style.setProperty('--ry', '0deg');
  }
}

/**
 * Pulls an element a few pixels toward the cursor while it is near.
 *
 * Reserved for a single primary action on a surface — the effect reads as
 * "this one is reachable", which stops meaning anything if everything does it.
 */
@Directive({ selector: '[axMagnet]', standalone: true })
export class MagnetDirective {
  private el = inject(ElementRef<HTMLElement>);
  /** Maximum travel in px. */
  @Input() axMagnet: number | string = 6;

  private get max() { return Number(this.axMagnet) || 6; }
  private off = REDUCED() || !FINE();

  @HostListener('pointermove', ['$event'])
  move(e: PointerEvent) {
    if (this.off) return;
    const n = this.el.nativeElement;
    const r = n.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width  / 2)) / (r.width  / 2);
    const dy = (e.clientY - (r.top  + r.height / 2)) / (r.height / 2);
    n.style.setProperty('--dx', `${(dx * this.max).toFixed(1)}px`);
    n.style.setProperty('--dy', `${(dy * this.max).toFixed(1)}px`);
  }

  @HostListener('pointerleave')
  leave() {
    const n = this.el.nativeElement;
    n.style.setProperty('--dx', '0px');
    n.style.setProperty('--dy', '0px');
  }
}

/**
 * Resolves text out of noise on hover.
 *
 * Decorative, so it is confined to display headings and card titles on the
 * front door and the agent gallery — never on navigation, which is hit dozens
 * of times a session and would be actively annoying.
 */
@Directive({ selector: '[axScramble]', standalone: true })
export class ScrambleDirective implements OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private raf = 0;
  private original = '';
  private off = REDUCED() || !FINE();

  private static readonly GLYPHS = '▚▞▤▦◈◉·:/\\|_-=+*#%@01';

  @HostListener('pointerenter')
  enter() {
    if (this.off) return;
    const n = this.el.nativeElement;
    if (!this.original) this.original = n.textContent ?? '';
    const text = this.original;
    const t0 = performance.now();
    const dur = 460;

    cancelAnimationFrame(this.raf);
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      // Characters lock in left to right; everything right of the front is noise.
      const front = p * text.length;
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === ' ' || i < front) { out += c; continue; }
        out += ScrambleDirective.GLYPHS[(Math.random() * ScrambleDirective.GLYPHS.length) | 0];
      }
      n.textContent = out;
      if (p < 1) this.raf = requestAnimationFrame(step);
      else n.textContent = text;
    };
    this.raf = requestAnimationFrame(step);
  }

  @HostListener('pointerleave')
  leave() {
    if (this.off) return;
    cancelAnimationFrame(this.raf);
    if (this.original) this.el.nativeElement.textContent = this.original;
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
    if (this.original) this.el.nativeElement.textContent = this.original;
  }
}

/**
 * Drifts an element against the scroll to sit behind the content plane.
 *
 * One shared scroll listener would be better than one per instance, but there
 * are at most two of these on any page and each does nothing but write a
 * custom property, so the simple form stays.
 */
@Directive({ selector: '[axParallax]', standalone: true })
export class ParallaxDirective implements AfterViewInit, OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  /** Travel in px across the full scroll of the element through the viewport. */
  @Input() axParallax: number | string = 40;

  private get depth() { return Number(this.axParallax) || 40; }
  private off = REDUCED();
  private ticking = false;
  private onScroll = () => {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      const n = this.el.nativeElement;
      const r = n.getBoundingClientRect();
      const vh = innerHeight || 1;
      // -1 above the fold, +1 below it.
      const k = (r.top + r.height / 2 - vh / 2) / vh;
      n.style.setProperty('--py', `${(k * this.depth).toFixed(1)}px`);
      this.ticking = false;
    });
  };

  ngAfterViewInit() {
    if (this.off) return;
    addEventListener('scroll', this.onScroll, { passive: true });
    this.onScroll();
  }
  ngOnDestroy() { removeEventListener('scroll', this.onScroll); }
}

/**
 * Paints the plasma hairline at the top of the viewport as the page scrolls.
 * Mounted once in the shell.
 */
@Component({
  selector: 'ax-scroll-progress',
  standalone: true,
  template: `<div class="sprog" [style.--p]="p()" aria-hidden="true"></div>`,
})
export class ScrollProgress implements AfterViewInit, OnDestroy {
  p = signal(0);
  /**
   * Synchronous for the same reason as the stage handler in enter.ts: a
   * rAF-gated `ticking` flag never clears if rAF is suspended, and the bar
   * then sticks at whatever fraction it last saw. Two property reads per
   * scroll event is not worth guarding against.
   */
  private onScroll = () => {
    const d = document.documentElement;
    const span = d.scrollHeight - d.clientHeight;
    this.p.set(span > 40 ? Math.min(1, d.scrollTop / span) : 0);
  };
  ngAfterViewInit() { addEventListener('scroll', this.onScroll, { passive: true }); this.onScroll(); }
  ngOnDestroy() { removeEventListener('scroll', this.onScroll); }
}

/**
 * A pointer-following bloom, one per app, mounted in the shell.
 *
 * Sits in the ambient layer under everything and never hit-tests. It exists so
 * the void reads as a lit room rather than a flat backdrop; it is switched off
 * entirely for reduced motion and for coarse pointers, where there is no
 * cursor to follow.
 */
@Component({
  selector: 'ax-cursor-glow',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (on) {
      <div class="cg" [style.--cx.px]="x()" [style.--cy.px]="y()" aria-hidden="true"></div>
    }
  `,
  styles: [`
    .cg {
      position:fixed; left:0; top:0; z-index:0; pointer-events:none;
      width:520px; height:520px; margin:-260px 0 0 -260px;
      border-radius:50%;
      background:radial-gradient(circle, rgba(139,92,246,.10), transparent 62%);
      transform:translate3d(var(--cx), var(--cy), 0);
      transition:opacity .4s var(--ease);
      opacity:var(--o, 0);
    }
  `],
})
export class CursorGlow implements AfterViewInit, OnDestroy {
  readonly on = !REDUCED() && FINE();
  x = signal(0);
  y = signal(0);
  private host = inject(ElementRef<HTMLElement>);
  private ticking = false;

  private onMove = (e: PointerEvent) => {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.x.set(e.clientX); this.y.set(e.clientY);
      const g = this.host.nativeElement.querySelector('.cg') as HTMLElement | null;
      g?.style.setProperty('--o', '1');
      this.ticking = false;
    });
  };
  private onLeave = () => {
    const g = this.host.nativeElement.querySelector('.cg') as HTMLElement | null;
    g?.style.setProperty('--o', '0');
  };

  ngAfterViewInit() {
    if (!this.on) return;
    addEventListener('pointermove', this.onMove, { passive: true });
    document.addEventListener('pointerleave', this.onLeave);
  }
  ngOnDestroy() {
    removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerleave', this.onLeave);
  }
}
