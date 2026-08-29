import {
  Component, ElementRef, Input, Output, EventEmitter, ViewChild,
  AfterViewInit, OnDestroy, inject, ChangeDetectionStrategy,
} from '@angular/core';

/* ===========================================================================
   Trace Routing — the scroll-driven landing scene.
   ---------------------------------------------------------------------------
   A single plasma filament routes across the viewport through the ten stages
   the way a trace routes across a board: orthogonal runs, 45-degree chamfered
   elbows, a via at every corner. Scroll draws it. Each node ignites as the
   drawn head passes it, and the last run leaves the board heading for the
   operator handle field.

   WHY A CANVAS AND NOT A VIDEO FILE
     A scrubbed <video> has to seek to a keyframe on every scroll tick, so it
     stutters exactly when the user is looking at it, ships 10-30 MB, and is
     locked to one aspect ratio. This is ~8 KB, scrubs at whatever rate the
     scroll produces, and is re-laid-out for the viewport it actually gets.

   COMPOSITION ACROSS ASPECT RATIOS
     The route is generated, never authored. Row count falls out of the aspect
     ratio, so an ultrawide monitor gets a long two-row snake and a phone gets
     a tall seven-row one; both keep every node inside the safe margin.

   COST
     One rAF while the stage is on screen, parked by IntersectionObserver and
     by visibilitychange. Under prefers-reduced-motion no loop is started at
     all and a single finished frame is painted instead.
   =========================================================================== */

interface Pt { x: number; y: number; }
interface Seg { a: Pt; b: Pt; len: number; at: number; }
interface Node { p: Pt; k: string; at: number; below: boolean; }
/** Fractions of the canvas the route may use. */
export interface Region { l: number; t: number; r: number; b: number; }

const KEYS = ['REQ', 'HLS', 'HLD', 'US', 'TR', 'LLD', 'TDD', 'CODE', 'SCA', 'SEC'];
const VIOLET = [139, 92, 246];
const CYAN   = [34, 211, 238];

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Plasma ramp sampled by normalised distance along the route. */
const ramp = (t: number, a = 1) => {
  const k = clamp01(t);
  return `rgba(${Math.round(lerp(VIOLET[0], CYAN[0], k))},`
       + `${Math.round(lerp(VIOLET[1], CYAN[1], k))},`
       + `${Math.round(lerp(VIOLET[2], CYAN[2], k))},${a})`;
};

@Component({
  selector: 'ax-trace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #cv class="tc" aria-hidden="true"></canvas>`,
  styles: [`
    :host { position:absolute; inset:0; display:block; z-index:0; pointer-events:none; }
    .tc { width:100%; height:100%; display:block; }
  `],
})
export class TraceHero implements AfterViewInit, OnDestroy {
  @ViewChild('cv') cvRef!: ElementRef<HTMLCanvasElement>;

  /** Scroll position through the stage, 0 to 1. */
  @Input() set progress(v: number) {
    this.p = clamp01(v);
    this.emitLit();
    if (this.reduced) return;                  // static frame, already painted
    // The rAF loop normally owns painting, but rAF is suspended in a
    // background tab, a prerender, or any context that is not compositing —
    // and there the scene would stay an empty black rectangle. If the loop has
    // not delivered a frame recently, paint from here instead. When rAF is
    // healthy this branch never runs.
    if (this.ctx && performance.now() - this.lastPaint > 120) this.paint(this.lastT);
  }

  /**
   * The sub-rectangle of the canvas the route is allowed to occupy, as
   * fractions of width and height. The page reserves the column its copy sits
   * in, because a route drawn across the full frame puts pads and labels on
   * top of the headline — which is exactly what it did before this existed.
   */
  @Input() set region(v: Region) {
    this.rgn = { ...this.rgn, ...v };
    if (this.ctx) { this.buildRoute(); this.paint(this.lastT); }
  }
  private rgn: Region = { l: 0, t: 0, r: 1, b: 1 };

  /**
   * How many of the ten nodes the head has passed. The page shows this as a
   * readout, and it has to come from the scene rather than be re-derived from
   * progress, or the number drifts out of step with the pads on screen.
   */
  @Output() lit = new EventEmitter<number>();
  private lastLit = -1;
  private emitLit() {
    if (!this.nodes.length) return;
    const n = this.nodes.filter(x => this.p >= x.at).length;
    if (n !== this.lastLit) { this.lastLit = n; this.lit.emit(n); }
  }

  private host = inject(ElementRef<HTMLElement>);
  private ctx!: CanvasRenderingContext2D;
  private p = 0;
  private raf = 0;
  private lastPaint = -1e9;
  private lastT = 0;
  private onScreen = true;
  private io?: IntersectionObserver;
  private ro?: ResizeObserver;

  private W = 0; private H = 0; private DPR = 1;
  private segs: Seg[] = [];
  private nodes: Node[] = [];
  private ghosts: Pt[][] = [];
  private total = 0;
  private grain?: CanvasPattern | null;

  private readonly reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- lifecycle

  ngAfterViewInit() {
    const cv = this.cvRef.nativeElement;
    const ctx = cv.getContext('2d');
    if (!ctx) return;                       // no 2d context: the poster stays
    this.ctx = ctx;

    this.measure();

    if (this.reduced) {
      // One finished frame: the whole route drawn, every node lit, no drift.
      this.p = 1;
      this.paint(0);
      this.ro = new ResizeObserver(() => { this.measure(); this.paint(0); });
      this.ro.observe(this.host.nativeElement);
      return;
    }

    // Paint one frame now so the scene is never blank before rAF starts.
    this.paint(0);

    this.ro = new ResizeObserver(() => { this.measure(); this.paint(this.lastT); });
    this.ro.observe(this.host.nativeElement);

    this.io = new IntersectionObserver(
      e => { this.onScreen = e[0]?.isIntersecting ?? true; },
      { threshold: 0 },
    );
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

  private frame = (t: number) => {
    // The blooms drift and the head breathes, so the scene is never fully
    // static — but only while it is actually on screen.
    if (this.onScreen) this.paint(t);
    this.raf = requestAnimationFrame(this.frame);
  };

  // ------------------------------------------------------------------ layout

  private measure() {
    const el = this.host.nativeElement;
    const cv = this.cvRef.nativeElement;
    this.DPR = Math.min(devicePixelRatio || 1, 2);
    this.W = el.clientWidth || 1;
    this.H = el.clientHeight || 1;
    cv.width = Math.round(this.W * this.DPR);
    cv.height = Math.round(this.H * this.DPR);
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    this.buildGrain();
    this.buildRoute();
  }

  /**
   * Ten nodes on a serpentine, then an orthogonal chamfered route between
   * them. Row count is derived from the aspect ratio so the same code lays
   * out an ultrawide monitor and a phone.
   */
  private buildRoute() {
    const W = this.W, H = this.H;

    // Everything below is laid out inside the reserved region, not the frame.
    const x0 = W * this.rgn.l, x1 = W * this.rgn.r;
    const y0 = H * this.rgn.t, y1 = H * this.rgn.b;
    const rw = Math.max(120, x1 - x0);
    const rh = Math.max(120, y1 - y0);

    // Row count follows the region's shape, so a tall narrow column beside the
    // copy gets many short rows and a wide band gets few long ones.
    const aspect = rw / rh;
    const rows = Math.max(2, Math.min(8, Math.round(4.6 / aspect)));

    const mx = Math.min(rw * 0.09, 84);
    const my = Math.min(rh * 0.1, 84);
    const usableW = rw - mx * 2;
    const usableH = rh - my * 2;
    const ox = x0 + mx, oy = y0 + my;
    const rowGap = rows > 1 ? usableH / (rows - 1) : 0;

    // Distribute ten nodes over the rows as evenly as the count allows.
    const per: number[] = Array.from({ length: rows }, (_, i) =>
      Math.floor(10 / rows) + (i < 10 % rows ? 1 : 0));

    const pts: Pt[] = [];
    let row = 0, made = 0;
    for (let r = 0; r < rows; r++) {
      const n = per[r];
      if (!n) continue;
      const y = oy + rowGap * r;
      const ltr = r % 2 === 0;
      for (let i = 0; i < n; i++) {
        // Inset the ends of each row so an elbow always has room to chamfer.
        const k = n === 1 ? 0.5 : i / (n - 1);
        const kk = 0.08 + k * 0.84;
        const x = ox + usableW * (ltr ? kk : 1 - kk);
        pts.push({ x, y });
        made++;
      }
      row++;
    }
    while (pts.length > 10) pts.pop();

    // Route: horizontal run, 45-degree elbow, vertical run.
    const chamfer = Math.min(26, rowGap * 0.42, usableW * 0.06);
    const poly: Pt[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = poly[poly.length - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) < 1.5 || Math.abs(dy) < 1.5) { poly.push(b); continue; }
      const sx = Math.sign(dx), sy = Math.sign(dy);
      const c = Math.min(chamfer, Math.abs(dx) * 0.5, Math.abs(dy) * 0.5);
      poly.push({ x: b.x - sx * c, y: a.y });
      poly.push({ x: b.x, y: a.y + sy * c });
      poly.push(b);
    }

    // A lead-in from the left edge and a lead-out toward the handle field, so
    // the trace arrives from somewhere and leaves for somewhere.
    poly.unshift({ x: x0 - 40, y: pts[0].y });
    const last = pts[pts.length - 1];
    poly.push({ x: last.x, y: H + 60 });

    // Segments plus cumulative arc length, which is what the draw scrubs on.
    this.segs = [];
    let acc = 0;
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.01) continue;
      this.segs.push({ a, b, len, at: acc });
      acc += len;
    }
    this.total = acc || 1;

    // Where each node sits along that arc, so it can light at the right time.
    this.nodes = pts.map((pt, i) => {
      let best = 0, bestD = Infinity;
      for (const s of this.segs) {
        const d = Math.hypot(s.b.x - pt.x, s.b.y - pt.y);
        if (d < bestD) { bestD = d; best = s.at + s.len; }
      }
      return { p: pt, k: KEYS[i] ?? '', at: best / this.total, below: pt.y < y1 - 34 };
    });
    this.lastLit = -1;
    this.emitLit();

    // Unlit routes behind the live one, so the field reads as a board rather
    // than one lonely line. Deliberately faint and never animated.
    this.ghosts = [];
    for (let g = 0; g < 3; g++) {
      const off = (g - 1) * rowGap * 0.36 + rowGap * 0.5;
      const line: Pt[] = [];
      for (let r = 0; r < rows; r++) {
        const y = oy + rowGap * r + off;
        if (y < y0 || y > y1) continue;
        const ltr = r % 2 === 0;
        line.push({ x: ltr ? x0 - 20 : x1 + 20, y });
        line.push({ x: ltr ? x1 + 20 : x0 - 20, y });
      }
      if (line.length) this.ghosts.push(line);
    }
  }

  private buildGrain() {
    const g = document.createElement('canvas');
    g.width = g.height = 128;
    const gx = g.getContext('2d');
    if (!gx) { this.grain = null; return; }
    const id = gx.createImageData(128, 128);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    gx.putImageData(id, 0, 0);
    this.grain = this.ctx.createPattern(g, 'repeat');
  }

  // ------------------------------------------------------------------- paint

  private paint(t: number) {
    const ctx = this.ctx, W = this.W, H = this.H;
    if (!ctx || !this.segs.length) return;
    this.lastPaint = performance.now();
    this.lastT = t;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#06070B';
    ctx.fillRect(0, 0, W, H);

    this.blooms(t);
    this.lattice();
    this.ghostRoutes();

    const L = this.p * this.total;
    this.trace(L);
    this.nodesPass();
    if (this.p > 0.001 && this.p < 0.999) this.head(L, t);

    this.vignette();
    if (this.grain) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  /** Two slow plasma pools, matching the ambient field behind the rest of the app. */
  private blooms(t: number) {
    const ctx = this.ctx, W = this.W, H = this.H;
    const R = Math.max(W, H) * 0.62;
    const drift = this.reduced ? 0 : t;
    ctx.globalCompositeOperation = 'lighter';
    const pools: [number, number, number[], number][] = [
      [W * 0.18, H * 0.26, [109, 40, 217], 0],
      [W * 0.82, H * 0.72, [14, 116, 144], 2.4],
    ];
    for (const [x, y, c, ph] of pools) {
      const dx = Math.sin(drift * 0.00005 + ph) * W * 0.05;
      const dy = Math.cos(drift * 0.00006 + ph) * H * 0.05;
      const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, R);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.26)`);
      g.addColorStop(0.62, `rgba(${c[0]},${c[1]},${c[2]},0.04)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private lattice() {
    const ctx = this.ctx, W = this.W, H = this.H, s = 74;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.022)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (W % s) / 2; x < W; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = (H % s) / 2; y < H; y += s) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.restore();
  }

  private ghostRoutes() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    for (const line of this.ghosts) {
      ctx.beginPath();
      line.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The live route, drawn to arc length L.
   * Three passes of decreasing width and increasing alpha stand in for a
   * bloom — far cheaper than shadowBlur or a canvas filter, and the falloff
   * is easier to control.
   */
  private trace(L: number) {
    const ctx = this.ctx;
    const passes: [number, number][] = [[9, 0.1], [4.5, 0.26], [1.8, 1]];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, a] of passes) {
      ctx.lineWidth = w;
      for (const s of this.segs) {
        if (s.at >= L) break;
        const take = Math.min(s.len, L - s.at);
        const k = take / s.len;
        const bx = lerp(s.a.x, s.b.x, k), by = lerp(s.a.y, s.b.y, k);
        const t0 = s.at / this.total, t1 = (s.at + take) / this.total;
        const g = ctx.createLinearGradient(s.a.x, s.a.y, bx, by);
        g.addColorStop(0, ramp(t0, a));
        g.addColorStop(1, ramp(t1, a));
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(s.a.x, s.a.y);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Pads and labels. A node lights when the head has passed it. */
  private nodesPass() {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    for (const n of this.nodes) {
      const lit = this.p >= n.at;
      const c = ramp(n.at);

      // Ignition ring: a short expanding pulse just after the head passes.
      // Derived from progress, so scrubbing backwards replays it correctly.
      const age = this.p - n.at;
      if (age > 0 && age < 0.05) {
        const k = age / 0.05;
        ctx.beginPath();
        ctx.arc(n.p.x, n.p.y, 9 + k * 30, 0, Math.PI * 2);
        ctx.strokeStyle = ramp(n.at, (1 - k) * 0.5);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (lit) {
        const g = ctx.createRadialGradient(n.p.x, n.p.y, 0, n.p.x, n.p.y, 28);
        g.addColorStop(0, ramp(n.at, 0.5));
        g.addColorStop(1, ramp(n.at, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.p.x, n.p.y, 28, 0, Math.PI * 2);
        ctx.fill();
      }

      // The pad itself: a square via, rotated 45 degrees, like a board.
      ctx.save();
      ctx.translate(n.p.x, n.p.y);
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.rect(-6.5, -6.5, 13, 13);
      ctx.fillStyle = lit ? c : '#06070B';
      ctx.fill();
      ctx.strokeStyle = lit ? c : 'rgba(255,255,255,.2)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Labels are the one piece of real text in the scene, so they get a
      // readable size and a shadow rather than the 9px they had, which was
      // illegible over the bloom.
      ctx.font = '600 12px "Azeret Mono", ui-monospace, monospace';
      // Shipped in Canvas2D but absent from this TypeScript lib; harmless where
      // it is not supported, the labels just sit a touch tighter.
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '.08em';
      ctx.shadowColor = 'rgba(6,7,11,.9)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = lit ? 'rgba(242,243,247,.96)' : 'rgba(120,127,148,.72)';
      ctx.fillText(n.k, n.p.x, n.p.y + (n.below ? 31 : -21));
      ctx.shadowBlur = 0;
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
    }
    ctx.restore();
  }

  /** The bright head of the trace, with a soft breath so it reads as live. */
  private head(L: number, t: number) {
    const ctx = this.ctx;
    let pt: Pt | null = null;
    for (const s of this.segs) {
      if (L >= s.at && L <= s.at + s.len) {
        const k = (L - s.at) / s.len;
        pt = { x: lerp(s.a.x, s.b.x, k), y: lerp(s.a.y, s.b.y, k) };
        break;
      }
    }
    if (!pt) return;
    const breathe = this.reduced ? 1 : 1 + Math.sin(t * 0.004) * 0.14;
    const r = 20 * breathe;
    const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
    g.addColorStop(0, 'rgba(255,255,255,.85)');
    g.addColorStop(0.32, ramp(this.p, 0.55));
    g.addColorStop(1, ramp(this.p, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  private vignette() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.24,
                                       W / 2, H / 2, Math.max(W, H) * 0.8);
    g.addColorStop(0, 'rgba(6,7,11,0)');
    g.addColorStop(1, 'rgba(6,7,11,.7)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
