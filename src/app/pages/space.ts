import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, interval, startWith, switchMap, takeUntil, catchError, of } from 'rxjs';
import { WorkspaceService, Workspace } from '../services/workspace.service';
import { WorkflowService, Workflow } from '../services/workflow.service';
import { MarkdownPipe } from '../pipes/markdown.pipe';
import { SpotDirective, MagnetDirective } from '../core/ui';
import { Ring, Split, Flow, FlowStage } from '../core/widgets';
import { Toaster } from '../core/toast';

const POLL_MS = 1200;

const LINE = [
  { n: 1,  k: 'REQ',  a: 'RequirementAnalysisRefinementAgent', t: 'Requirement' },
  { n: 2,  k: 'HLS',  a: 'HLSAgent',                           t: 'Solution' },
  { n: 3,  k: 'HLD',  a: 'HLDAgent',                           t: 'Design' },
  { n: 4,  k: 'US',   a: 'UserStoryAgent',                     t: 'Stories' },
  { n: 5,  k: 'TR',   a: 'TRReviewAgent',                      t: 'Test review' },
  { n: 6,  k: 'LLD',  a: 'LLDAgent',                           t: 'Low-level' },
  { n: 7,  k: 'TDD',  a: 'TDDAgent',                           t: 'Strategy' },
  { n: 8,  k: 'CODE', a: 'CodingAgent',                        t: 'Build' },
  { n: 9,  k: 'SCA',  a: 'StaticCodeAnalysisAgent',            t: 'Analysis' },
  { n: 10, k: 'SEC',  a: 'SecurityAgent',                      t: 'Security' },
];

/**
 * The review surface: pick a stage, read what it produced, decide.
 *
 * Provenance mode diffs a stage against the artifact it consumed, and derives
 * its callouts from headings that exist downstream but not upstream — so
 * "what did this agent actually add" is answerable without reading 20 KB.
 */
@Component({
  selector: 'ax-space',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MarkdownPipe, SpotDirective, MagnetDirective,
            Ring, Split, Flow],
  template: `
  <div class="pg">
    <div class="head">
      <div>
        <a routerLink="/workspaces" class="tag back">← Spaces</a>
        <h2>{{ ws()?.projectName ?? '…' }}</h2>
      </div>
      <a routerLink="/run" class="btn magnet" axMagnet="6">New run</a>
    </div>

    <!-- stats strip -->
    <div class="strip">
      <div class="sc glass glass--live glass--spot lift" axSpot>
        <ax-ring [value]="done()" [total]="10" [size]="60"/>
        <div class="sc-l">
          <div class="tag">Progress</div>
          <div class="sc-v mono" [style.color]="anyLive() ? 'var(--run)' : 'var(--ink-2)'">
            {{ anyLive() ? 'running' : (done() === 10 ? 'complete' : 'holding') }}
          </div>
        </div>
      </div>

      <div class="sc sc--w glass glass--live glass--spot lift" axSpot>
        <div class="tag">States</div>
        <ax-split [data]="stateSplit()"/>
      </div>

      <div class="sc sc--w glass glass--live glass--spot lift" axSpot>
        <div class="tag">Waiting on you</div>
        <div class="sc-big mono" [style.color]="reviewCount() ? 'var(--review)' : 'var(--ink-4)'">
          {{ reviewCount() }}
        </div>
        <div class="sc-s">{{ reviewCount() === 1 ? 'stage in review' : 'stages in review' }}</div>
      </div>
    </div>

    <!-- stage rail -->
    <div class="rail glass" axSpot>
      <ax-flow [stages]="flowStages()" [live]="anyLive()" [selected]="sel()" (pick)="pick($event)"/>
    </div>

    <div class="body">
      <section class="doc glass" axSpot>
        <div class="d-top">
          <div>
            <div class="tag">{{ cur()?.k }} · {{ cur()?.t }}</div>
            <div class="d-state mono" [style.color]="cur()?.color">{{ cur()?.label }}</div>
          </div>
          <div class="d-right">
            @if (out()) { <span class="d-size mono">{{ sizeLabel() }}</span> }
            <div class="d-modes">
              <button class="md" [class.on]="!lens() && !raw()"
                      (click)="lens.set(false); raw.set(false)">Doc</button>
              <button class="md" [class.on]="raw() && !lens()"
                      (click)="lens.set(false); raw.set(true)">Raw</button>
              @if (sel() > 1) { <button class="md" [class.on]="lens()" (click)="openLens()">Provenance</button> }
            </div>
          </div>
        </div>

        @if (loading()) { <div class="shimmer sk"></div> }
        @else if (!out()) {
          <div class="void">
            <div class="void-t">Nothing produced yet</div>
            <div class="void-s">{{ cur()?.k }} has not run, or produced no output.</div>
          </div>
        }
        @else if (!lens()) {
          <div class="doc-scroll">
            @if (raw()) {
              <pre class="rawdoc">{{ out() }}</pre>
            } @else {
              <div class="md-body" [innerHTML]="out() | markdown"></div>
            }
          </div>
        } @else {
          <div class="lens">
            <div class="l-bar">
              <span class="tag">{{ added().length }} new sections</span>
              <span class="tag mono">{{ delta() > 0 ? '+' : '' }}{{ delta() }}</span>
            </div>
            <div class="l-stage" (pointerdown)="drag($event, true)" (pointermove)="drag($event)"
                 (pointerup)="dragging = false" (pointerleave)="dragging = false">
              <pre class="l-p l-after">{{ out() }}</pre>
              <pre class="l-p l-before" [style.clip-path]="'inset(0 ' + (100 - split()) + '% 0 0)'">{{ prev() }}</pre>
              @for (a of added(); track a.h; let i = $index) {
                <span class="pin" [style.top.%]="8 + i * 12">{{ a.h }}</span>
              }
              <div class="seam" [style.left.%]="split()"><i></i></div>
            </div>
          </div>
        }
      </section>

      <aside class="side">
        <div class="glass p decide" [class.decide--live]="canDecide()" axSpot>
          <div class="p-h">
            <span class="tag">Decide</span>
            <span class="mono p-k" [style.color]="cur()?.color">{{ cur()?.k }}</span>
          </div>

          @if (canDecide()) {
            <p class="decide-x">
              Approving hands this artifact to <b>{{ nextName() }}</b> as its input.
            </p>
            <textarea class="note" [(ngModel)]="note" name="c" rows="3"
                      placeholder="Notes — required to rework, optional otherwise"></textarea>
            <div class="acts">
              <button class="btn act ok press" (click)="decide('APPROVE')" [disabled]="sending()">
                {{ sending() ? 'Sending…' : 'Approve' }}
              </button>
              <div class="acts-2">
                <button class="btn act rw press" (click)="decide('REWORK')"
                        [disabled]="sending() || !note.trim()"
                        [title]="note.trim() ? 'Re-run this stage with your notes' : 'Add notes to rework'">
                  Rework
                </button>
                <button class="btn act rj press" (click)="decide('REJECT')" [disabled]="sending()">
                  Reject
                </button>
              </div>
            </div>
          } @else {
            <div class="void void--sm">
              {{ cur()?.state === 'PENDING'
                 ? 'This stage has not run yet.'
                 : (cur()?.state === 'IN_PROGRESS' || cur()?.state === 'INIT'
                    ? 'Running now — the decision opens when it lands in review.'
                    : 'No action pending on this stage.') }}
            </div>
          }
        </div>

        <div class="glass p lift" axSpot>
          <div class="tag">Meta</div>
          <div class="kv"><span>Stack</span><b>{{ ws()?.techStack || '—' }}</b></div>
          <div class="kv"><span>Mode</span><b>{{ ws()?.pipelineMode === 'full-sequence' ? 'Full' : 'Per story' }}</b></div>
          <div class="kv"><span>Done</span><b class="mono">{{ done() }}/10</b></div>
        </div>
      </aside>
    </div>
  </div>
  `,
  styles: [`
    .pg { position:relative; z-index:1; }
    .head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:16px; }
    .back { display:block; margin-bottom:5px; }
    .back:hover { color:var(--plasma-b); }

    .strip { display:grid; gap:10px; grid-template-columns:auto 1fr 1fr; margin-bottom:10px; }
    @media (max-width:760px){ .strip { grid-template-columns:1fr; } }
    .sc { display:flex; align-items:center; gap:14px; padding:14px 16px; border-radius:var(--r-2); }
    .sc--w { flex-direction:column; align-items:flex-start; gap:9px; justify-content:center; }
    .sc-l { display:flex; flex-direction:column; gap:4px; }
    .sc-v { font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
    .sc-big { font-family:var(--f-display); font-size:1.9rem; font-weight:700; letter-spacing:-.04em; }
    .sc-s { font-size:12px; color:var(--ink-4); margin-top:-4px; }

    .rail { display:flex; gap:3px; padding:14px 16px; margin-bottom:10px; }
    .st { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;
          padding:5px 2px; border-radius:var(--r-1);
          transition:background var(--t-hov) var(--ease), transform var(--t-hov) var(--ease); }
    @media (hover: hover) and (pointer: fine) {
      .st:hover { background:var(--raise); transform:translateY(-2px); }
    }
    .st.on { background:var(--raise-3); }
    .st-bar { width:100%; height:22px; border-radius:2px; background:var(--raise-2); transition:background .35s var(--ease), box-shadow .35s var(--ease); }
    .st-bar.lit { background:var(--c); box-shadow:0 0 11px -2px var(--c); }
    .st-k { font-size:10.5px; font-weight:600; color:var(--ink-3); }
    .st.on .st-k { color:var(--ink-2); }

    /* min-width:0 is load-bearing. A grid item defaults to min-width:auto, so
       the doc column refuses to shrink below its widest child — one long
       heading or table and the column grows, the page scrolls sideways, and
       the decide panel leaves the viewport entirely. */
    .body { display:grid; gap:10px; grid-template-columns:minmax(0,1fr) 312px; align-items:start; }
    .body > * { min-width:0; }
    @media (max-width:1080px){ .body { grid-template-columns:1fr; } }

    .doc { padding:18px 20px 20px; min-height:420px; min-width:0; overflow:hidden; }
    .d-top { display:flex; align-items:flex-start; justify-content:space-between; gap:14px;
             padding-bottom:12px; border-bottom:1px solid var(--edge); margin-bottom:14px; }
    .d-state { font-size:12px; margin-top:5px; letter-spacing:.06em; }
    .d-modes { display:flex; gap:2px; padding:2px; background:var(--sink); border-radius:var(--r-1); }
    .md { padding:7px 13px; font-size:12.5px; border-radius:4px; color:var(--ink-3); }
    .md.on { background:var(--raise-3); color:var(--ink); }
    .sk { height:300px; }
    .void { color:var(--ink-4); font-size:12.5px; padding:34px 0; text-align:center; }

    /* The document's own typography is global (see styles.css) — component
       styles cannot reach [innerHTML] content. Only the scroll frame is set
       here, which is this component's business. */
    .doc-scroll {
      max-height:min(72vh, 780px);
      overflow-y:auto; overflow-x:hidden;
      min-width:0;
      padding-right:12px; margin-right:-12px;   /* scrollbar outside the measure */
      scrollbar-gutter:stable;
    }

    /* provenance */
    .l-bar { display:flex; justify-content:space-between; margin-bottom:9px; }
    .l-stage { position:relative; height:420px; overflow:hidden; border-radius:var(--r-1);
               border:1px solid var(--edge); background:var(--sink); cursor:col-resize; touch-action:none; }
    .l-p { position:absolute; inset:0; margin:0; padding:14px 16px; font-family:var(--f-mono);
           font-size:10.5px; line-height:1.7; white-space:pre-wrap; word-break:break-word;
           overflow:hidden; color:var(--ink-3); }
    .l-after { background:var(--raise); }
    .l-before { background:var(--void); color:var(--ink-4); border-right:1px solid var(--plasma-solid); }
    .pin { position:absolute; left:0; z-index:4; background:var(--plasma-solid); color:#fff;
           font-family:var(--f-mono); font-size:9px; padding:2px 7px; border-radius:0 3px 3px 0;
           max-width:210px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; pointer-events:none; }
    .seam { position:absolute; top:0; bottom:0; width:2px; background:var(--plasma-solid); z-index:5; }
    .seam i { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
              width:26px; height:26px; border-radius:50%; background:var(--plasma-solid); }

    /* The decide panel is the point of this page, so it stays on screen while
       the operator scrolls a long artifact. */
    .side { display:flex; flex-direction:column; gap:10px;
            position:sticky; top:12px; }
    @media (max-width:1080px){ .side { position:static; } }

    .decide--live { border-color:var(--edge-live); }
    .p-h { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .p-k { font-size:11px; letter-spacing:.12em; }
    .decide-x { font-size:12px; color:var(--ink-3); line-height:1.55; margin-top:10px; }
    .decide-x b { color:var(--ink-2); font-weight:600; }

    .acts-2 { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:6px; }
    .void--sm { padding:14px 0; text-align:left; font-size:12.5px; line-height:1.55; }

    .d-right { display:flex; align-items:center; gap:12px; flex-wrap:wrap; justify-content:flex-end; }
    .d-size { font-size:10.5px; color:var(--ink-4); white-space:nowrap; }
    .void-t { color:var(--ink-2); font-size:14px; }
    .void-s { color:var(--ink-4); font-size:12.5px; margin-top:5px; }

    .rawdoc { font-family:var(--f-mono); font-size:12.5px; line-height:1.7;
              color:var(--ink-3); white-space:pre-wrap; word-break:break-word;
              margin:0; }
    .p { padding:15px 16px; }
    .note { width:100%; margin-top:10px; padding:9px 11px; resize:vertical;
            background:var(--sink); border:1px solid var(--edge); border-radius:var(--r-1);
            color:var(--ink); font-size:12.5px; }
    .note:focus { outline:none; border-color:var(--edge-live); }
    .acts { display:grid; gap:5px; margin-top:9px; }
    .act { height:37px; font-size:13px; }
    .ok:not(:disabled):hover { background:rgba(52,211,153,.16); color:var(--ok); }
    .rw:not(:disabled):hover { background:rgba(251,191,36,.16); color:var(--run); }
    .rj:not(:disabled):hover { background:rgba(251,113,133,.16); color:var(--bad); }
    .kv { display:flex; justify-content:space-between; gap:12px; font-size:12.5px; color:var(--ink-3); margin-top:9px; }
    .kv b { color:var(--ink-2); text-align:right; }
  `],
})
export class SpacePage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private wsApi = inject(WorkspaceService);
  private wfApi = inject(WorkflowService);
  private toast = inject(Toaster);
  private stop$ = new Subject<void>();

  id = 0;
  ws = signal<Workspace | null>(null);
  flows = signal<Workflow[]>([]);
  sel = signal(1);
  out = signal<string | null>(null);
  prev = signal<string>('');
  loading = signal(false);
  lens = signal(false);
  raw = signal(false);
  sending = signal(false);
  split = signal(50);
  note = '';
  dragging = false;

  ngOnInit() {
    // paramMap, not snapshot. Angular reuses this component when navigating
    // from /workspaces/1 to /workspaces/2, so ngOnInit does not re-run and a
    // snapshot read leaves the page showing the previous workspace's data
    // under the new URL.
    this.route.paramMap.pipe(takeUntil(this.stop$)).subscribe(pm => {
      const id = Number(pm.get('id'));
      if (id === this.id) return;
      this.id = id;
      this.reset();
      this.wsApi.getWorkspaceById(id).pipe(catchError(() => of(null)), takeUntil(this.stop$))
        .subscribe(w => this.ws.set(w));
      this.fetch(this.sel());
    });

    interval(POLL_MS).pipe(
      startWith(0),
      switchMap(() => this.wfApi.getAllWorkflows().pipe(catchError(() => of([])))),
      takeUntil(this.stop$),
    ).subscribe(all => {
      const mine = (all ?? []).filter(w => w.workspaceId === this.id);
      const before = this.stages().map(s => s.state).join();
      this.flows.set(mine);
      // Re-fetch when the selected stage's state changed under us — a stage
      // that just landed in review now has a document where it had none.
      const after = this.stages().map(s => s.state).join();
      if (this.out() === null && !this.loading()) this.fetch(this.sel());
      else if (before !== after && !this.loading()) this.fetch(this.sel());
    });
  }

  /** Clear per-workspace state when the route changes. */
  private reset() {
    this.sel.set(1); this.out.set(null); this.prev.set('');
    this.lens.set(false); this.raw.set(false); this.note = '';
  }
  ngOnDestroy() { this.stop$.next(); this.stop$.complete(); }

  private states = computed(() => {
    const m: Record<string, string> = {};
    for (const w of this.flows()) if (w.agentName) m[w.agentName] = w.state;
    return m;
  });

  stages = computed(() => LINE.map(s => {
    const st = this.states()[s.a] ?? 'PENDING';
    return { ...s, state: st, label: st.replace(/_/g, ' '), color: this.color(st) };
  }));

  cur = computed(() => this.stages().find(s => s.n === this.sel()));

  flowStages = computed<FlowStage[]>(() => this.stages()
    .map(s => ({ k: s.k, state: s.state, color: s.color, label: s.label })));

  anyLive = computed(() => this.stages()
    .some(s => s.state === 'IN_PROGRESS' || s.state === 'INIT'));

  reviewCount = computed(() => this.stages().filter(s => s.state === 'IN_REVIEW').length);

  /** Every stage bucketed by state, for the stacked bar.
      Named apart from `split`, which is the provenance seam position. */
  stateSplit = computed(() => {
    const st = this.stages();
    const has = (...s: string[]) => st.filter(x => s.includes(x.state)).length;
    return [
      { k: 'Approved', v: has('APPROVED', 'COMPLETED'), c: 'var(--ok)' },
      { k: 'Running',  v: has('IN_PROGRESS', 'INIT'),   c: 'var(--run)' },
      { k: 'Review',   v: has('IN_REVIEW'),             c: 'var(--review)' },
      { k: 'Rework',   v: has('REWORK'),                c: 'var(--plasma-a)' },
      { k: 'Failed',   v: has('FAILED', 'REJECTED'),    c: 'var(--bad)' },
      { k: 'Pending',  v: has('PENDING'),               c: 'var(--idle)' },
    ];
  });
  done = computed(() => this.stages().filter(s => s.state === 'APPROVED' || s.state === 'COMPLETED').length);
  canDecide = computed(() => this.cur()?.state === 'IN_REVIEW');

  pick(n: number) {
    this.sel.set(n); this.lens.set(false); this.raw.set(false);
    this.prev.set(''); this.fetch(n);
  }

  /** Which agent receives this artifact once it is approved. */
  nextName() {
    const next = LINE.find(l => l.n === this.sel() + 1);
    return next ? `${next.k} · ${next.t}` : 'the end of the line';
  }

  sizeLabel() {
    const n = this.out()?.length ?? 0;
    if (!n) return '';
    const words = (this.out()!.trim().match(/\S+/g) ?? []).length;
    return n < 1024 ? `${n} B · ${words} words`
                    : `${(n / 1024).toFixed(1)} KB · ${words} words`;
  }

  private fetch(n: number) {
    this.loading.set(true); this.out.set(null);
    this.wfApi.getAgentOutput(n, this.id, 1).pipe(catchError(() => of(null))).subscribe(r => {
      const c = r?.content;
      this.out.set(c == null ? null : (typeof c === 'string' ? c : JSON.stringify(c, null, 2)));
      this.loading.set(false);
    });
  }

  openLens() {
    this.lens.set(true);
    if (this.prev() || this.sel() <= 1) return;
    this.wfApi.getAgentOutput(this.sel() - 1, this.id, 1)
      .pipe(catchError(() => of(null)))
      .subscribe(r => {
        const c = r?.content;
        this.prev.set(c == null ? '' : (typeof c === 'string' ? c : JSON.stringify(c, null, 2)));
      });
  }

  /** Headings present downstream but not upstream — what this agent added. */
  added = computed(() => {
    const hs = (t: string) => (t.match(/^#{1,4} .+$/gm) ?? []).map(h => h.replace(/^#+\s*/, '').trim());
    const before = new Set(hs(this.prev()).map(h => h.toLowerCase()));
    return hs(this.out() ?? '').filter(h => !before.has(h.toLowerCase())).slice(0, 6)
      .map(h => ({ h: h.length > 28 ? h.slice(0, 27) + '…' : h }));
  });
  delta = computed(() => (this.out()?.length ?? 0) - this.prev().length);

  drag(e: PointerEvent, start = false) {
    if (start) this.dragging = true;
    if (!this.dragging) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.split.set(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  }

  decide(d: 'APPROVE' | 'REWORK' | 'REJECT') {
    if (this.sending()) return;
    this.sending.set(true);
    this.wfApi.approveWorkflow({
      workspaceId: this.id, requirementId: 1, agentNumber: this.sel(),
      decision: d as any, comments: this.note.trim(),
    } as any).subscribe({
      next: () => {
        this.sending.set(false); this.note = '';
        const k = this.cur()?.k ?? 'stage';
        if (d === 'APPROVE')     this.toast.ok(`${k} approved`, 'next stage dispatched');
        else if (d === 'REWORK') this.toast.run(`${k} sent back`, 're-running with your notes');
        else                     this.toast.info(`${k} rejected`, 'the line stops here');
      },
      error: e => {
        this.sending.set(false);
        this.toast.bad('Decision was not recorded', e?.error?.message ?? 'request failed');
      },
    });
  }

  color(s: string): string {
    switch (s) {
      case 'APPROVED': case 'COMPLETED': return 'var(--ok)';
      case 'IN_PROGRESS': case 'INIT':   return 'var(--run)';
      case 'IN_REVIEW':                  return 'var(--review)';
      case 'FAILED': case 'REJECTED':    return 'var(--bad)';
      default:                           return 'var(--idle)';
    }
  }
}
