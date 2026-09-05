import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { SystemService } from '../services/system.service';
import { WorkflowService, Workflow } from '../services/workflow.service';
import { WorkspaceService, Workspace } from '../services/workspace.service';
import { Subject, interval, takeUntil, switchMap, startWith, catchError, of } from 'rxjs';
import { Session } from '../core/session';
import {
  SpotDirective, RevealDirective, CountUp, Spark, TiltDirective, MagnetDirective,
} from '../core/ui';
import { Ring, Bars, Heat, Gauge, Split, Flow, Ticker, FlowStage } from '../core/widgets';
import { Toaster } from '../core/toast';
import { Waves } from '../core/waves';



interface Health { status: string; uptime: string; memory: { usedMB: number; maxMB: number }; stats: any; }

const LINE = [
  { k: 'REQ',  n: 'RequirementAnalysisRefinementAgent', t: 'Requirement' },
  { k: 'HLS',  n: 'HLSAgent',                           t: 'Solution' },
  { k: 'HLD',  n: 'HLDAgent',                           t: 'Design' },
  { k: 'US',   n: 'UserStoryAgent',                     t: 'Stories' },
  { k: 'TR',   n: 'TRReviewAgent',                      t: 'Test review' },
  { k: 'LLD',  n: 'LLDAgent',                           t: 'Low-level' },
  { k: 'TDD',  n: 'TDDAgent',                           t: 'Strategy' },
  { k: 'CODE', n: 'CodingAgent',                        t: 'Build' },
  { k: 'SCA',  n: 'StaticCodeAnalysisAgent',            t: 'Analysis' },
  { k: 'SEC',  n: 'SecurityAgent',                      t: 'Security' },
];

/**
 * Operator console.
 *
 * A widget wall, not a document: every tile is one live reading. There is no
 * greeting, no product blurb, and no explanatory subtext — the operator knows
 * what they are looking at.
 *
 * Tiles are ordered by how often they answer a question: what needs me now,
 * where is the line, what is the machine doing, what happened recently.
 */
@Component({
  selector: 'ax-console',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    SpotDirective, RevealDirective, CountUp, Spark, TiltDirective, MagnetDirective,
    Ring, Bars, Heat, Gauge, Split, Flow, Ticker, Waves,
  ],
  template: `
  <div class="con" axReveal>

    <div class="head">
      <ax-waves [count]="5" [intensity]="0.34" [spread]="0.5"/>
      <div class="hd-l">
        <div class="tag">{{ op()?.handle }}</div>
        <h2>Console</h2>
      </div>
      <div class="head-r">
        <span class="pulse" [class.pulse--up]="!!health()">
          <i class="dot dot--beat" [style.--c]="health() ? 'var(--ok)' : 'var(--bad)'"></i>
          <span class="mono">{{ health() ? 'backend up' : 'no backend' }}</span>
        </span>
        <a routerLink="/run" class="btn btn--plasma magnet" axMagnet="6">New run</a>
      </div>
    </div>

    <!-- ---------- attention bar: only rendered when something waits ---------- -->
    @if (waiting().length) {
      <div class="att glass rise">
        <i class="dot dot--beat" style="--c: var(--review)"></i>
        <span class="att-t">
          {{ waiting().length }} stage{{ waiting().length === 1 ? '' : 's' }} waiting on you
        </span>
        <div class="att-l">
          @for (w of waiting(); track w.id) {
            <a class="att-i press" [routerLink]="['/workspaces', w.workspaceId]">
              <span class="mono">{{ short(w.agentName) }}</span>
              <span class="att-w">{{ nameOf(w.workspaceId) }}</span>
            </a>
          }
        </div>
      </div>
    }

    <div class="wall">

      <!-- ---------- metrics ---------- -->
      @for (m of metrics(); track m.k) {
        <article class="w w--sm glass glass--live glass--spot lift sheen" axSpot>
          <div class="tag">{{ m.k }}</div>
          <div class="big"><ax-count [value]="m.v"/></div>
          <ax-spark [data]="m.series"/>
        </article>
      }

      <!-- ---------- line completion ---------- -->
      <article class="w w--sm w--mid glass glass--live glass--spot lift ringw" axSpot>
        <div class="tag">Line</div>
        <div class="ringw-b">
          <ax-ring [value]="done()" [total]="10" [size]="72"/>
          <div class="ringw-l">
            <div class="rw-s mono" [style.color]="anyLive() ? 'var(--run)' : 'var(--ink-3)'">
              {{ anyLive() ? 'running' : (done() ? 'holding' : 'idle') }}
            </div>
            <div class="rw-n">{{ nextUp() }}</div>
          </div>
        </div>
      </article>

      <!-- ---------- the signature widget ---------- -->
      <article class="w w--full glass glass--spot" axSpot>
        <div class="w-top">
          <div class="tag">Pipeline</div>
          <a routerLink="/agents" class="tag lnk etrace">What each does →</a>
        </div>
        <ax-flow [stages]="flowStages()" [live]="anyLive()" [selected]="sel()" (pick)="goStage($event)"/>
      </article>

      <!-- ---------- state split ---------- -->
      <article class="w w--wide glass glass--live glass--spot lift" axSpot>
        <div class="w-top"><div class="tag">States</div><div class="tag mono">{{ flows().length }} rows</div></div>
        <ax-split [data]="split()"/>
      </article>

      <!-- ---------- runtime ---------- -->
      <article class="w w--sm glass glass--live glass--spot lift" axSpot>
        <div class="tag">Heap</div>
        @if (health(); as h) {
          <div class="gw"><ax-gauge [value]="heapPct()" [max]="100" unit="%"/></div>
          <div class="kv"><span>Uptime</span><b class="mono">{{ h.uptime }}</b></div>
          <div class="kv"><span>Used</span><b class="mono">{{ h.memory.usedMB }}M / {{ h.memory.maxMB }}M</b></div>
        } @else { <div class="shimmer sk"></div> }
      </article>

      <!-- ---------- throughput heat ---------- -->
      <article class="w w--sm w--mid glass glass--live glass--spot lift" axSpot>
        <div class="w-top"><div class="tag">Density</div><div class="tag mono">{{ flows().length }}</div></div>
        <ax-heat [data]="heat()" [cols]="10" unit="run"/>
        <div class="hlab mono"><span>REQ</span><span>SEC</span></div>
      </article>

      <!-- ---------- activity ---------- -->
      <article class="w w--tall glass glass--spot" axSpot>
        <div class="w-top"><div class="tag">Activity</div><a routerLink="/runs" class="tag lnk etrace">All</a></div>
        @if (recent().length) {
          <ul class="feed">
            @for (w of recent(); track w.id) {
              <li class="fi press" [routerLink]="['/workspaces', w.workspaceId]" tabindex="0">
                <i class="dot" [class.dot--beat]="isLive(w.state)" [style.--c]="colorOf(w.state)"></i>
                <span class="f-a mono">{{ short(w.agentName) }}</span>
                <span class="f-s">{{ w.state.replace('_', ' ') }}</span>
                <span class="f-i mono">#{{ w.id }}</span>
              </li>
            }
          </ul>
        } @else { <div class="void">No runs yet · <a routerLink="/run" class="lnk">start one</a></div> }
      </article>

      <!-- ---------- stage tally ---------- -->
      <article class="w w--wide glass glass--live glass--spot lift" axSpot>
        <div class="w-top"><div class="tag">Per stage</div><div class="tag mono">{{ done() }}/10 approved</div></div>
        <ax-bars [data]="perStage()" [colors]="perStageColors()" [labels]="keys" [height]="68"/>
        <div class="blab mono">@for (k of keys; track k) { <span>{{ k }}</span> }</div>
      </article>

      <!-- ---------- workspaces ---------- -->
      <article class="w w--wide w--mid glass glass--spot" axSpot>
        <div class="w-top"><div class="tag">Workspaces</div><a routerLink="/workspaces" class="tag lnk etrace">All</a></div>
        @if (spaces().length) {
          <div class="ws">
            @for (s of spaces(); track s.id) {
              <a class="ws-i press" [routerLink]="['/workspaces', s.id!]">
                <span class="mono ws-n">{{ pad(s.id!) }}</span>
                <span class="ws-t">{{ s.projectName }}</span>
                <span class="ws-c mono">{{ countFor(s.id!) }}</span>
              </a>
            }
          </div>
        } @else {
          <div class="void">None yet · <a routerLink="/workspaces" class="lnk">create one</a></div>
        }
      </article>
    </div>

    <ax-ticker [items]="ticker()" [duration]="42"/>
  </div>
  `,
  styles: [`
    .con { position:relative; z-index:1; padding:var(--gut); max-width:var(--max); margin:0 auto;
           display:flex; flex-direction:column; gap:12px; }
    /* The band behind the title is the only decorative surface on the console;
       the instrument wall below it stays plain so readings stay readable. */
    .head { position:relative; isolation:isolate; overflow:hidden;
            display:flex; align-items:flex-end; justify-content:space-between; gap:20px;
            padding:14px 18px; margin:-14px -18px 0; border-radius:var(--r-2); }
    .hd-l, .head-r { position:relative; z-index:1; }
    .head h2 { margin-top:5px; }
    .head-r { display:flex; align-items:center; gap:14px; }
    .pulse { display:flex; align-items:center; gap:7px; font-size:11.5px; color:var(--ink-4);
             letter-spacing:.08em; text-transform:uppercase; }
    @media (max-width:620px){ .pulse { display:none; } }

    /* attention bar */
    .att { display:flex; align-items:center; gap:12px; padding:11px 14px; flex-wrap:wrap;
           border-color:var(--edge-live); }
    .att-t { font-size:13.5px; color:var(--ink); }
    .att-l { display:flex; gap:6px; flex-wrap:wrap; margin-left:auto; }
    .att-i { display:flex; align-items:center; gap:7px; padding:5px 10px; border-radius:var(--r-1);
             background:var(--raise-2); font-size:12.5px; cursor:pointer;
             transition:background var(--t-hov) var(--ease), transform var(--t-hov) var(--ease); }
    .att-i .mono { font-size:11.5px; color:var(--plasma-b); }
    .att-w { color:var(--ink-3); }
    @media (hover: hover) and (pointer: fine) {
      .att-i:hover { background:var(--raise-3); transform:translateY(-1px); }
    }

    /* wall */
    .wall { display:grid; gap:10px; grid-template-columns:repeat(12,1fr); }
    /* A column, not a block. The wall grid stretches every card in a row to
       the tallest card's height; as a block the card handed that height to
       nobody, so a short widget clumped at the top and left a dead band below
       it while its own content could still overflow the padding. As a column
       the header keeps its intrinsic height and the widget is given the rest. */
    .w { padding:16px 17px; min-height:112px; display:flex; flex-direction:column; }
    .w > :last-child { min-height:0; }
    /* Some widgets have an intrinsic size — a 72px ring, a row of square heat
       cells — and genuinely cannot use the height the row gives them. Pinning
       that remainder below the content reads as a layout bug; splitting it
       above and below reads as deliberate. The header stays put either way. */
    .w--mid > :nth-child(2) { margin-top:auto; }
    .w--mid > :last-child   { margin-bottom:auto; }
    .w--sm   { grid-column:span 3; }
    .w--wide { grid-column:span 6; }
    .w--full { grid-column:span 12; }
    .w--tall { grid-column:span 3; grid-row:span 2; }
    @media (max-width:1100px){ .w--sm{grid-column:span 6;} .w--wide,.w--tall{grid-column:span 12;} .w--tall{grid-row:auto;} }
    @media (max-width:620px){ .w--sm{grid-column:span 12;} }

    .w-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap:10px; flex:none; }
    .big { font-family:var(--f-display); font-size:2.4rem; font-weight:700; letter-spacing:-.04em; margin:6px 0 4px; }
    .sk { height:70px; margin-top:10px; }
    .void { color:var(--ink-4); font-size:13px; padding:10px 0; }
    .lnk { color:var(--plasma-b); }

    /* ring tile */
    .ringw-b { display:flex; align-items:center; gap:14px; margin-top:10px; }
    .ringw-l { min-width:0; }
    .rw-s { font-size:11.5px; letter-spacing:.08em; text-transform:uppercase; }
    .rw-n { font-size:12.5px; color:var(--ink-3); margin-top:5px;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    /* runtime */
    .gw { margin:8px 0 4px; }
    .kv { display:flex; justify-content:space-between; font-size:12.5px; color:var(--ink-3); margin-top:7px; }
    .kv b { color:var(--ink-2); }

    .hlab, .blab { display:flex; justify-content:space-between; margin-top:8px; font-size:10px; color:var(--ink-4); }

    /* feed */
    .feed { list-style:none; display:flex; flex-direction:column; gap:2px; }
    .fi { display:flex; align-items:center; gap:9px; font-size:12px; cursor:pointer;
          padding:6px 7px; margin:0 -7px; border-radius:var(--r-1);
          transition:background var(--t-hov) var(--ease); }
    @media (hover: hover) and (pointer: fine) { .fi:hover { background:var(--raise); } }
    .f-a { color:var(--ink-2); font-size:12px; width:42px; flex:none; }
    .f-s { flex:1; color:var(--ink-3); font-size:12.5px; letter-spacing:.03em; }
    .f-i { color:var(--ink-4); font-size:11px; }

    /* workspaces */
    .ws { display:grid; gap:6px; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); }
    .ws-i { display:flex; align-items:center; gap:9px; padding:9px 11px; border-radius:var(--r-1);
            background:var(--raise);
            transition:background var(--t-hov) var(--ease), transform var(--t-hov) var(--ease); }
    @media (hover: hover) and (pointer: fine) {
      .ws-i:hover { background:var(--raise-3); transform:translateX(3px); }
    }
    .ws-n { font-size:11px; color:var(--ink-4); }
    .ws-t { font-size:13.5px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ws-c { font-size:11px; color:var(--ink-4); }
  `],
})
export class ConsolePage implements OnInit, OnDestroy {
  private sys = inject(SystemService);
  private wf = inject(WorkflowService);
  private ws = inject(WorkspaceService);
  private session = inject(Session);
  private router = inject(Router);
  private toast = inject(Toaster);
  private stop$ = new Subject<void>();

  op = this.session.operator;
  health = signal<Health | null>(null);
  flows = signal<Workflow[]>([]);
  spaces = signal<Workspace[]>([]);
  sel = signal(0);
  private hist = signal<number[]>([]);
  private wasDown = false;

  readonly keys = LINE.map(l => l.k);

  ngOnInit() {
    interval(1500).pipe(
      startWith(0),
      switchMap(() => this.sys.getHealth().pipe(catchError(() => of(null)))),
      takeUntil(this.stop$),
    ).subscribe(h => {
      // Announce a transition, never a steady state — a toast per poll would
      // be a fire hose.
      if (!h && !this.wasDown) { this.wasDown = true; this.toast.bad('Backend unreachable', 'GET /api/health failed'); }
      if (h && this.wasDown)   { this.wasDown = false; this.toast.ok('Backend back up'); }
      if (!h) { this.health.set(null); return; }
      this.health.set(h);
      // Short window so the sparkline shows movement, not a flat line.
      this.hist.update(a => [...a, h.memory.usedMB].slice(-24));
    });

    interval(1200).pipe(
      startWith(0),
      switchMap(() => this.wf.getAllWorkflows().pipe(catchError(() => of([])))),
      takeUntil(this.stop$),
    ).subscribe(w => this.flows.set(w ?? []));

    this.ws.listWorkspaces()
      .pipe(catchError(() => of([])), takeUntil(this.stop$))
      .subscribe(s => this.spaces.set(s ?? []));
  }
  ngOnDestroy() { this.stop$.next(); this.stop$.complete(); }

  /** Latest state per agent — an agent reruns on rework, so last write wins. */
  private states = computed(() => {
    const m: Record<string, string> = {};
    for (const w of this.flows()) if (w.agentName) m[w.agentName] = w.state;
    return m;
  });

  line = computed(() => LINE.map(s => {
    const st = this.states()[s.n] ?? 'PENDING';
    return { ...s, state: st, label: st.replace(/_/g, ' '), color: this.colorOf(st) };
  }));

  flowStages = computed<FlowStage[]>(() =>
    this.line().map(s => ({ k: s.k, state: s.state, color: s.color, label: s.label })));

  done = computed(() => this.line().filter(s => s.state === 'APPROVED' || s.state === 'COMPLETED').length);
  anyLive = computed(() => this.line().some(s => this.isLive(s.state)));

  /** The stage a run is sitting on, or the one it would reach next. */
  nextUp = computed(() => {
    const l = this.line();
    const running = l.find(s => this.isLive(s.state));
    if (running) return `${running.k} · ${running.t}`;
    const review = l.find(s => s.state === 'IN_REVIEW');
    if (review) return `${review.k} awaiting review`;
    const next = l.find(s => s.state === 'PENDING');
    return next ? `next · ${next.t}` : 'line complete';
  });

  /** Rows the operator can actually act on right now. */
  waiting = computed(() => this.flows().filter(w => w.state === 'IN_REVIEW').slice(0, 5));

  recent = computed(() => [...this.flows()].reverse().slice(0, 9));

  metrics = computed(() => {
    const st = this.health()?.stats ?? {};
    const h = this.hist();
    return [
      { k: 'Workspaces', v: st.workspaces ?? this.spaces().length, series: h },
      { k: 'Runs',       v: st.totalWorkflows ?? this.flows().length, series: h },
      { k: 'Active',     v: st.activeWorkflows ?? this.flows().filter(f => this.isLive(f.state)).length, series: h },
    ];
  });

  /** Every workflow row bucketed by state, for the stacked bar. */
  split = computed(() => {
    const f = this.flows();
    const has = (...s: string[]) => f.filter(w => s.includes(w.state)).length;
    return [
      { k: 'Approved', v: has('APPROVED', 'COMPLETED'), c: 'var(--ok)' },
      { k: 'Running',  v: has('IN_PROGRESS', 'INIT'),   c: 'var(--run)' },
      { k: 'Review',   v: has('IN_REVIEW'),             c: 'var(--review)' },
      { k: 'Rework',   v: has('REWORK'),                c: 'var(--plasma-a)' },
      { k: 'Failed',   v: has('FAILED', 'REJECTED'),    c: 'var(--bad)' },
    ];
  });

  /** Rows per stage, laid out as a 10-wide grid — density across the line. */
  heat = computed(() => {
    const per = new Map<string, number>();
    for (const w of this.flows()) {
      const k = LINE.find(l => l.n === w.agentName)?.k;
      if (k) per.set(k, (per.get(k) ?? 0) + 1);
    }
    // Two rows: total rows per stage, then approved per stage.
    const totals = this.keys.map(k => per.get(k) ?? 0);
    const approved = this.line().map(s => (s.state === 'APPROVED' || s.state === 'COMPLETED' ? 1 : 0));
    return [...totals, ...approved];
  });

  perStage = computed(() => this.line().map(s => {
    if (s.state === 'APPROVED' || s.state === 'COMPLETED') return 2;
    return s.state === 'PENDING' ? 0 : 1;
  }));
  perStageColors = computed(() => this.line().map(s => s.color));

  ticker = computed(() => {
    const h = this.health();
    const out = [
      `${this.spaces().length} workspace${this.spaces().length === 1 ? '' : 's'}`,
      `${this.flows().length} workflow rows`,
      `${this.done()} of 10 stages approved`,
      h ? `heap ${h.memory.usedMB}M of ${h.memory.maxMB}M` : 'backend unreachable',
      h ? `up ${h.uptime}` : 'awaiting backend',
      this.anyLive() ? 'line running' : 'line idle',
    ];
    return out;
  });

  countFor(id: number) {
    const n = this.flows().filter(w => w.workspaceId === id).length;
    return n ? String(n) : '—';
  }
  nameOf(id: number) {
    return this.spaces().find(s => s.id === id)?.projectName ?? `ws ${id}`;
  }

  /** A stage click on the console is a request to go read it. */
  goStage(n: number) {
    this.sel.set(n);
    const target = this.flows().find(w => LINE[n - 1] && w.agentName === LINE[n - 1].n);
    if (target) this.router.navigate(['/workspaces', target.workspaceId]);
    else this.toast.info(`${LINE[n - 1].k} has not run yet`, LINE[n - 1].t);
  }

  heapPct = computed(() => {
    const h = this.health();
    return h ? Math.round((h.memory.usedMB / h.memory.maxMB) * 100) : 0;
  });

  isLive(s: string) { return s === 'IN_PROGRESS' || s === 'INIT'; }

  colorOf(s: string): string {
    switch (s) {
      case 'APPROVED': case 'COMPLETED': return 'var(--ok)';
      case 'IN_PROGRESS': case 'INIT':   return 'var(--run)';
      case 'IN_REVIEW':                  return 'var(--review)';
      case 'REWORK':                     return 'var(--plasma-a)';
      case 'FAILED': case 'REJECTED':    return 'var(--bad)';
      default:                           return 'var(--idle)';
    }
  }
  short(n: string) { return (LINE.find(l => l.n === n)?.k) ?? n?.slice(0, 6); }
  pad(n: number) { return String(n).padStart(2, '0'); }
}
