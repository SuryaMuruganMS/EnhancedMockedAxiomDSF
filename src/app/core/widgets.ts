import {
  Component, Input, Output, EventEmitter, computed, signal, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/* ===========================================================================
   Widgets — the console's reading instruments.
   ---------------------------------------------------------------------------
   Every widget here is a pure function of its inputs: no HTTP, no timers, no
   router. A page fetches, a widget renders. That keeps each one testable and
   lets the same instrument appear on the console, a workspace, and the runs
   board without three copies drifting apart.

   All of them draw with inline SVG rather than divs, because they need to
   scale to a container of unknown width without the caller doing arithmetic.
   =========================================================================== */

let uid = 0;
/** SVG defs are document-global, so every gradient needs its own id. */
const nextId = (p: string) => `${p}${++uid}`;

/* ---------------------------------------------------------------------------
   Ring — one ratio, read at a glance.
   Used for line completion (n of 10) where the exact number matters less than
   how close to done it is.
   --------------------------------------------------------------------------- */
@Component({
  selector: 'ax-ring',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ring" [style.--sz.px]="size">
      <svg [attr.viewBox]="'0 0 ' + box + ' ' + box" aria-hidden="true">
        <defs>
          <linearGradient [attr.id]="gid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--plasma-a)"/>
            <stop offset="100%" stop-color="var(--plasma-b)"/>
          </linearGradient>
        </defs>
        <circle class="ring-t" [attr.cx]="c" [attr.cy]="c" [attr.r]="r" [attr.stroke-width]="stroke"/>
        <circle class="ring-v" [attr.cx]="c" [attr.cy]="c" [attr.r]="r" [attr.stroke-width]="stroke"
                [attr.stroke]="'url(#' + gid + ')'"
                [attr.stroke-dasharray]="circ"
                [attr.stroke-dashoffset]="offset()"
                [attr.transform]="'rotate(-90 ' + c + ' ' + c + ')'"/>
      </svg>
      <div class="ring-c">
        <span class="ring-n mono">{{ value }}</span>
        @if (total) { <span class="ring-d mono">/{{ total }}</span> }
      </div>
    </div>
  `,
  styles: [`
    .ring { position:relative; width:var(--sz); height:var(--sz); flex:none; }
    .ring svg { width:100%; height:100%; display:block; }
    .ring-t { fill:none; stroke:var(--raise-2); }
    .ring-v { fill:none; stroke-linecap:round; transition:stroke-dashoffset .9s var(--ease); }
    .ring-c { position:absolute; inset:0; display:flex; align-items:baseline;
              justify-content:center; gap:1px; }
    .ring-n { font-size:calc(var(--sz) * .3); font-weight:600; color:var(--ink); letter-spacing:-.04em; }
    .ring-d { font-size:max(11px, calc(var(--sz) * .17)); color:var(--ink-4); }
    @media (prefers-reduced-motion: reduce) { .ring-v { transition:none; } }
  `],
})
export class Ring {
  @Input() value = 0;
  @Input() total = 10;
  @Input() size = 76;

  readonly box = 100;
  readonly c = 50;
  readonly stroke = 7;
  readonly r = 50 - 7 / 2;
  readonly circ = 2 * Math.PI * (50 - 7 / 2);
  readonly gid = nextId('ring');

  offset = () => {
    const p = this.total ? Math.max(0, Math.min(1, this.value / this.total)) : 0;
    return this.circ * (1 - p);
  };
}

/* ---------------------------------------------------------------------------
   Bars — a short series where each column is a discrete event, not a sample.
   Distinct from ax-spark, which draws a continuous reading.
   --------------------------------------------------------------------------- */
@Component({
  selector: 'ax-bars',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bars" [style.--h.px]="height">
      @for (b of bars(); track b.i) {
        <div class="bar" [title]="b.label">
          <div class="bar-f" [style.height.%]="b.pct" [style.--c]="b.color"
               [style.animation-delay]="(b.i * 34) + 'ms'"></div>
        </div>
      }
      @if (!bars().length) { <div class="bars-e"></div> }
    </div>
  `,
  styles: [`
    .bars { display:flex; align-items:flex-end; gap:3px; height:var(--h); }
    .bar { flex:1; height:100%; display:flex; align-items:flex-end;
           border-radius:2px; background:var(--raise); overflow:hidden; }
    .bar-f {
      width:100%; border-radius:2px;
      background:var(--c, var(--plasma-solid));
      transform-origin:bottom; transform:scaleY(0);
      animation:barIn .5s var(--ease) forwards;
      transition:filter var(--t-hov) var(--ease);
    }
    @keyframes barIn { to { transform:scaleY(1); } }
    @media (hover: hover) and (pointer: fine) {
      .bar:hover .bar-f { filter:brightness(1.45); }
    }
    .bars-e { flex:1; border-radius:2px; background:var(--raise); }
    @media (prefers-reduced-motion: reduce) {
      .bar-f { animation:none; transform:scaleY(1); }
    }
  `],
})
export class Bars {
  @Input() set data(v: number[]) { this._d.set(v ?? []); }
  @Input() set colors(v: string[]) { this._c.set(v ?? []); }
  @Input() labels: string[] = [];
  @Input() height = 40;

  private _d = signal<number[]>([]);
  private _c = signal<string[]>([]);

  bars = computed(() => {
    const d = this._d();
    const max = Math.max(1, ...d);
    return d.map((n, i) => ({
      i,
      // Floor at 4% so a zero column still reads as a column, not a gap.
      pct: Math.max(4, (n / max) * 100),
      color: this._c()[i],
      label: this.labels[i] ? `${this.labels[i]} · ${n}` : String(n),
    }));
  });
}

/* ---------------------------------------------------------------------------
   Heat — a calendar-style density grid.
   Reads run volume over a window at a glance; the exact count lives in the
   tooltip, because the shape is the information here.
   --------------------------------------------------------------------------- */
@Component({
  selector: 'ax-heat',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="heat" [style.--cols]="cols">
      @for (c of cells(); track c.i) {
        <i class="hc" [style.opacity]="c.o" [title]="c.t"
           [style.animation-delay]="(c.i * 7) + 'ms'"></i>
      }
    </div>
  `,
  styles: [`
    .heat { display:grid; grid-template-columns:repeat(var(--cols), 1fr); gap:3px; }
    .hc {
      aspect-ratio:1; border-radius:2px; background:var(--plasma-solid);
      animation:hcIn .4s var(--ease) both;
      transition:transform var(--t-hov) var(--ease), box-shadow var(--t-hov) var(--ease);
    }
    @keyframes hcIn { from { transform:scale(.4); } to { transform:scale(1); } }
    @media (hover: hover) and (pointer: fine) {
      .hc:hover { transform:scale(1.4); box-shadow:0 0 10px -1px var(--plasma-solid); }
    }
    @media (prefers-reduced-motion: reduce) { .hc { animation:none; } }
  `],
})
export class Heat {
  @Input() set data(v: number[]) { this._d.set(v ?? []); }
  @Input() cols = 14;
  @Input() unit = 'run';

  private _d = signal<number[]>([]);

  cells = computed(() => {
    const d = this._d();
    const max = Math.max(1, ...d);
    return d.map((n, i) => ({
      i,
      // .06 floor keeps the grid visible as a grid on empty days.
      o: n ? 0.16 + (n / max) * 0.84 : 0.06,
      t: `${n} ${this.unit}${n === 1 ? '' : 's'}`,
    }));
  });
}

/* ---------------------------------------------------------------------------
   Gauge — a bounded reading with a redline, for pressure-style values
   (heap, queue depth) where "how close to the limit" is the question.
   --------------------------------------------------------------------------- */
@Component({
  selector: 'ax-gauge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gauge">
      <svg viewBox="0 0 100 56" aria-hidden="true">
        <defs>
          <linearGradient [attr.id]="gid" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="var(--plasma-a)"/>
            <stop offset="70%" stop-color="var(--plasma-b)"/>
            <stop offset="100%" stop-color="var(--bad)"/>
          </linearGradient>
        </defs>
        <path class="g-t" [attr.d]="arc"/>
        <path class="g-v" [attr.d]="arc" [attr.stroke]="'url(#' + gid + ')'"
              [attr.stroke-dasharray]="len"
              [attr.stroke-dashoffset]="offset()"/>
        <line class="g-red" x1="88.5" y1="16" x2="94" y2="12.5"/>
      </svg>
      <div class="g-v-n mono">{{ value }}<span class="g-u">{{ unit }}</span></div>
    </div>
  `,
  styles: [`
    .gauge { position:relative; }
    .gauge svg { width:100%; height:auto; display:block; overflow:visible; }
    .g-t { fill:none; stroke:var(--raise-2); stroke-width:6; stroke-linecap:round; }
    .g-v { fill:none; stroke-width:6; stroke-linecap:round; transition:stroke-dashoffset .9s var(--ease); }
    .g-red { stroke:var(--bad); stroke-width:1.5; opacity:.5; }
    .g-v-n { position:absolute; left:0; right:0; bottom:0; text-align:center;
             font-size:17px; font-weight:600; color:var(--ink); }
    .g-u { font-size:10.5px; color:var(--ink-4); margin-left:3px; }
    @media (prefers-reduced-motion: reduce) { .g-v { transition:none; } }
  `],
})
export class Gauge {
  @Input() value = 0;
  @Input() max = 100;
  @Input() unit = '%';

  /** A 180° arc of radius 44 centred at (50,50). */
  readonly arc = 'M6 50 A44 44 0 0 1 94 50';
  readonly len = Math.PI * 44;
  readonly gid = nextId('gauge');

  offset = () => {
    const p = this.max ? Math.max(0, Math.min(1, this.value / this.max)) : 0;
    return this.len * (1 - p);
  };
}

/* ---------------------------------------------------------------------------
   Split — a single stacked bar breaking a total into named parts.
   Chosen over a donut: at these sizes a bar's segments stay comparable and
   the legend can sit inline.
   --------------------------------------------------------------------------- */
@Component({
  selector: 'ax-split',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sp">
      <div class="sp-bar">
        @for (p of parts(); track p.k) {
          <div class="sp-seg" [style.width.%]="p.pct" [style.--c]="p.c" [title]="p.k + ' · ' + p.v"></div>
        }
        @if (!parts().length) { <div class="sp-empty"></div> }
      </div>
      <div class="sp-key">
        @for (p of parts(); track p.k) {
          <span class="sp-ki"><i [style.background]="p.c"></i>{{ p.k }}<b class="mono">{{ p.v }}</b></span>
        }
      </div>
    </div>
  `,
  styles: [`
    .sp-bar { display:flex; gap:2px; height:8px; border-radius:var(--r-full); overflow:hidden; }
    .sp-seg { background:var(--c); border-radius:2px; transition:width .7s var(--ease), filter var(--t-hov) var(--ease); min-width:3px; }
    @media (hover: hover) and (pointer: fine) { .sp-seg:hover { filter:brightness(1.4); } }
    .sp-empty { flex:1; background:var(--raise-2); }
    .sp-key { display:flex; flex-wrap:wrap; gap:5px 13px; margin-top:11px; }
    .sp-ki { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink-3); }
    .sp-ki i { width:6px; height:6px; border-radius:2px; flex:none; }
    .sp-ki b { color:var(--ink-2); font-weight:600; font-size:11.5px; }
    @media (prefers-reduced-motion: reduce) { .sp-seg { transition:none; } }
  `],
})
export class Split {
  @Input() set data(v: { k: string; v: number; c: string }[]) { this._d.set(v ?? []); }
  private _d = signal<{ k: string; v: number; c: string }[]>([]);

  parts = computed(() => {
    const d = this._d().filter(p => p.v > 0);
    const total = d.reduce((a, p) => a + p.v, 0) || 1;
    return d.map(p => ({ ...p, pct: (p.v / total) * 100 }));
  });
}

/* ---------------------------------------------------------------------------
   Flow — the ten-stage line as a live instrument.
   The signature widget: this is the product's actual subject, so it is drawn
   rather than described. Each stage is a node whose fill is its state; the
   plasma trace between nodes animates only while a stage is genuinely running,
   so motion here means something is happening on the machine.
   --------------------------------------------------------------------------- */
export interface FlowStage { k: string; state: string; color: string; label?: string; }

@Component({
  selector: 'ax-flow',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fl" [class.fl--live]="live">
      @for (s of stages; track s.k; let i = $index; let last = $last) {
        <button class="fn" type="button"
                [class.on]="selected === i + 1"
                [class.done]="isDone(s.state)"
                [style.--c]="s.color"
                [attr.aria-current]="selected === i + 1 ? 'step' : null"
                [title]="s.k + ' — ' + (s.label || s.state)"
                (click)="pick.emit(i + 1)">
          <span class="fn-d"></span>
          <span class="fn-k mono">{{ s.k }}</span>
        </button>
        @if (!last) {
          <span class="fw" [class.hot]="isDone(s.state)"><i></i></span>
        }
      }
    </div>
  `,
  styles: [`
    .fl { display:flex; align-items:center; gap:0; width:100%; }

    .fn {
      display:flex; flex-direction:column; align-items:center; gap:7px;
      padding:4px 2px; border-radius:var(--r-1); flex:none;
      transition:transform var(--t-hov) var(--ease), background var(--t-hov) var(--ease);
    }
    .fn-d {
      width:15px; height:15px; border-radius:50%;
      background:var(--void);
      box-shadow:inset 0 0 0 2px var(--c, var(--idle));
      transition:box-shadow var(--t-move) var(--ease), background var(--t-move) var(--ease);
    }
    .fn.done .fn-d { background:var(--c); box-shadow:inset 0 0 0 2px var(--c), 0 0 12px -1px var(--c); }
    .fn-k { font-size:11px; font-weight:600; color:var(--ink-3); letter-spacing:.08em; transition:color var(--t-hov) var(--ease); }
    .fn.on .fn-k, .fn.done .fn-k { color:var(--ink-2); }
    .fn.on { background:var(--raise-2); }
    @media (hover: hover) and (pointer: fine) {
      .fn:hover { transform:translateY(-2px); background:var(--raise); }
      .fn:hover .fn-k { color:var(--ink); }
    }
    .fn:active { transform:scale(.96); }

    /* the wire between two nodes */
    .fw { flex:1; height:2px; background:var(--raise-2); border-radius:2px; margin-bottom:15px;
          position:relative; overflow:hidden; min-width:6px; }
    .fw i {
      position:absolute; inset:0;
      background:var(--plasma);
      transform:scaleX(0); transform-origin:left;
      transition:transform .6s var(--ease);
    }
    .fw.hot i { transform:scaleX(1); }

    /* Only a genuinely running line gets a travelling pulse. */
    .fl--live .fw.hot::after {
      content:''; position:absolute; top:0; bottom:0; width:26px;
      background:linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent);
      animation:flpulse 2.2s linear infinite;
    }
    @keyframes flpulse { from { transform:translateX(-30px); } to { transform:translateX(240px); } }

    @media (prefers-reduced-motion: reduce) {
      .fn:hover, .fn:active { transform:none; }
      .fw i { transition:none; }
      .fl--live .fw.hot::after { animation:none; }
    }
  `],
})
export class Flow {
  @Input() stages: FlowStage[] = [];
  @Input() selected = 0;
  @Input() live = false;
  /** Emits the 1-based stage number. */
  @Output() pick = new EventEmitter<number>();

  isDone(s: string) { return s !== 'PENDING' && s !== 'IDLE'; }
}

/* ---------------------------------------------------------------------------
   Ticker — a slow horizontal reel of short facts.
   Constant motion, so linear easing and no start/stop. It pauses on hover
   (see .mq in styles.css) because a moving line you cannot read is hostile.
   --------------------------------------------------------------------------- */
@Component({
  selector: 'ax-ticker',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mq" [style.--mq-d]="duration + 's'">
      @for (pass of [0, 1]; track pass) {
        <div class="mq-t" [attr.aria-hidden]="pass === 1 ? 'true' : null">
          @for (it of items; track $index) {
            <span class="tk"><i class="tk-d"></i>{{ it }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .tk { display:flex; align-items:center; gap:9px; white-space:nowrap;
          font-family:var(--f-mono); font-size:11.5px; letter-spacing:.11em;
          text-transform:uppercase; color:var(--ink-3); }
    .tk-d { width:3px; height:3px; border-radius:50%; background:var(--plasma-solid); flex:none; }
  `],
})
export class Ticker {
  @Input() items: string[] = [];
  @Input() duration = 34;
}
