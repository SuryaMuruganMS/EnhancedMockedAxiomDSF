import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, interval, startWith, switchMap, takeUntil, catchError, of } from 'rxjs';
import { WorkflowService, Workflow } from '../services/workflow.service';
import { WorkspaceService, Workspace } from '../services/workspace.service';
import { SpotDirective, MagnetDirective } from '../core/ui';
import { Waves } from '../core/waves';

const ORDER = ['REQ','HLS','HLD','US','TR','LLD','TDD','CODE','SCA','SEC'];
const SHORT: Record<string, string> = {
  RequirementAnalysisRefinementAgent:'REQ', HLSAgent:'HLS', HLDAgent:'HLD',
  UserStoryAgent:'US', TRReviewAgent:'TR', LLDAgent:'LLD', TDDAgent:'TDD',
  CodingAgent:'CODE', StaticCodeAnalysisAgent:'SCA', SecurityAgent:'SEC',
};

/**
 * Every run, grouped by workspace, polled live.
 *
 * The unit an operator cares about is the workspace's line position, not the
 * individual workflow row — so each group renders as a ten-segment track with
 * the rows underneath.
 */
@Component({
  selector: 'ax-runs',
  standalone: true,
  imports: [CommonModule, RouterModule, SpotDirective, MagnetDirective, Waves],
  template: `
  <div class="pg">
    <div class="head">
      <div><div class="tag">Live</div><h2>Runs</h2></div>
      <div class="head-r">
        <span class="tag mono">{{ flows().length }} total</span>
        <a routerLink="/run" class="btn btn--plasma magnet" axMagnet="6">New run</a>
      </div>
    </div>

    <div class="filters">
      @for (f of FILTERS; track f.v) {
        <button class="fc press" [class.on]="filter() === f.v" (click)="filter.set(f.v)">
          <i class="fc-d" [style.--c]="f.c"></i>{{ f.k }}
          <span class="mono fc-n">{{ countOf(f.v) }}</span>
        </button>
      }
    </div>

    @if (!flows().length) {
      <div class="empty glass">
        <ax-waves [count]="6" [intensity]="0.6" [spread]="0.68"/>
        <div class="empty-in">
          <h3 class="empty-h">Nothing has run yet</h3>
          <p class="empty-p">Point the line at a workspace and it will show up here, stage by stage.</p>
          <a routerLink="/run" class="btn btn--plasma magnet" axMagnet="6">Start a run</a>
        </div>
      </div>
    } @else {
      @if (!groups().length) {
        <div class="empty glass">
          <span>Nothing in this state</span>
          <button class="btn press" (click)="filter.set('all')">Show all</button>
        </div>
      }
      <div class="groups">
        @for (g of groups(); track g.id) {
          <section class="grp glass glass--spot lift" axSpot>
            <div class="g-top">
              <a [routerLink]="['/workspaces', g.id]" class="g-n">
                <span class="mono g-id">{{ pad(g.id) }}</span>{{ g.name }}
              </a>
              <span class="tag mono">{{ g.done }}/10</span>
            </div>

            <div class="track">
              @for (s of g.track; track s.k) {
                <div class="tseg" [title]="s.k + ' — ' + s.label">
                  <div class="tseg-b" [style.--c]="s.color" [class.on]="s.state !== 'PENDING'"></div>
                </div>
              }
            </div>

            <ul class="rows">
              @for (w of g.rows; track w.id) {
                <li>
                  <i class="dot" [class.dot--beat]="live(w.state)" [style.--c]="color(w.state)"></i>
                  <span class="mono r-k">{{ short(w.agentName) }}</span>
                  <span class="r-s">{{ w.state.replace('_',' ') }}</span>
                  <span class="mono r-i">#{{ w.id }}</span>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    }
  </div>
  `,
  styles: [`
    .pg { position:relative; z-index:1; }
    .head { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:18px; gap:16px; }
    .head-r { display:flex; align-items:center; gap:14px; }
    .head h2 { margin-top:5px; }

    .groups { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); }
    .grp { padding:16px 17px; }
    .g-top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .g-n { display:flex; align-items:center; gap:9px; font-size:14.5px; font-weight:600; }
    .g-n { transition:color var(--t-hov) var(--ease); }
    .g-n:hover { color:var(--plasma-b); }
    .g-id { font-size:11px; color:var(--ink-4); }

    .track { display:flex; gap:3px; margin-bottom:13px; }
    .tseg { flex:1; }
    .tseg-b { height:5px; border-radius:2px; background:var(--raise-2); transition:background .4s var(--ease), box-shadow .4s var(--ease); }
    .tseg-b.on { background:var(--c); box-shadow:0 0 9px -1px var(--c); }

    .rows { list-style:none; display:flex; flex-direction:column; gap:7px; }
    .rows li { display:flex; align-items:center; gap:9px; font-size:12px;
               padding:4px 6px; margin:0 -6px; border-radius:var(--r-1);
               transition:background var(--t-hov) var(--ease); }
    @media (hover: hover) and (pointer: fine) { .rows li:hover { background:var(--raise); } }
    .r-k { font-size:12px; font-weight:600; color:var(--ink-2); width:44px; }
    .r-s { flex:1; color:var(--ink-3); font-size:12.5px; }
    .r-i { font-size:11px; color:var(--ink-4); }

    .empty { position:relative; isolation:isolate; overflow:hidden;
             padding:clamp(48px,7vw,88px) 32px; border-radius:var(--r-2); }
    .empty-in { position:relative; z-index:1; display:flex; flex-direction:column;
                align-items:center; gap:11px; text-align:center; }
    .empty-h { font-size:1.08rem; color:var(--ink); }
    .empty-p { font-size:13.5px; color:var(--ink-3); max-width:42ch; margin-bottom:6px; }

    .filters { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:14px; }
    .fc { display:flex; align-items:center; gap:7px; padding:7px 13px;
          border-radius:var(--r-full); font-size:12.5px; color:var(--ink-3);
          background:var(--raise);
          transition:background var(--t-hov) var(--ease), color var(--t-hov) var(--ease),
                     transform var(--t-press) var(--ease); }
    @media (hover: hover) and (pointer: fine) { .fc:hover { background:var(--raise-2); color:var(--ink-2); } }
    .fc.on { background:var(--raise-3); color:var(--ink); }
    .fc-d { width:5px; height:5px; border-radius:50%; background:var(--c); flex:none; }
    .fc-n { font-size:11px; color:var(--ink-4); }
  `],
})
export class RunsPage implements OnInit, OnDestroy {
  private wf = inject(WorkflowService);
  private ws = inject(WorkspaceService);
  private stop$ = new Subject<void>();

  flows = signal<Workflow[]>([]);
  spaces = signal<Workspace[]>([]);
  filter = signal('all');

  readonly FILTERS = [
    { k: 'All',      v: 'all',    c: 'var(--ink-3)' },
    { k: 'Running',  v: 'live',   c: 'var(--run)' },
    { k: 'Review',   v: 'review', c: 'var(--review)' },
    { k: 'Approved', v: 'done',   c: 'var(--ok)' },
    { k: 'Failed',   v: 'bad',    c: 'var(--bad)' },
  ];

  /** A group survives the filter if any of its rows matches. */
  private match(w: Workflow, f: string) {
    switch (f) {
      case 'live':   return this.live(w.state);
      case 'review': return w.state === 'IN_REVIEW';
      case 'done':   return w.state === 'APPROVED' || w.state === 'COMPLETED';
      case 'bad':    return w.state === 'FAILED' || w.state === 'REJECTED';
      default:       return true;
    }
  }
  visible = computed(() => this.flows().filter(w => this.match(w, this.filter())));
  countOf = (f: string) => this.flows().filter(w => this.match(w, f)).length;

  ngOnInit() {
    interval(5000).pipe(
      startWith(0),
      switchMap(() => this.wf.getAllWorkflows().pipe(catchError(() => of([])))),
      takeUntil(this.stop$),
    ).subscribe(w => this.flows.set(w ?? []));

    this.ws.listWorkspaces().pipe(catchError(() => of([])), takeUntil(this.stop$))
      .subscribe(s => this.spaces.set(s ?? []));
  }
  ngOnDestroy() { this.stop$.next(); this.stop$.complete(); }

  groups = computed(() => {
    const byWs = new Map<number, Workflow[]>();
    for (const w of this.visible()) {
      const k = w.workspaceId ?? 0;
      if (!byWs.has(k)) byWs.set(k, []);
      byWs.get(k)!.push(w);
    }
    return [...byWs.entries()].map(([id, rows]) => {
      // Last write per agent wins — rework re-runs the same agent.
      const latest: Record<string, string> = {};
      for (const r of rows) if (r.agentName) latest[SHORT[r.agentName] ?? r.agentName] = r.state;
      const track = ORDER.map(k => {
        const st = latest[k] ?? 'PENDING';
        return { k, state: st, label: st.replace(/_/g, ' '), color: this.color(st) };
      });
      return {
        id,
        name: this.spaces().find(s => s.id === id)?.projectName ?? `Workspace ${id}`,
        rows: [...rows].reverse().slice(0, 6),
        track,
        done: track.filter(t => t.state === 'APPROVED' || t.state === 'COMPLETED').length,
      };
    }).sort((a, b) => a.id - b.id);
  });

  color(s: string): string {
    switch (s) {
      case 'APPROVED': case 'COMPLETED': return 'var(--ok)';
      case 'IN_PROGRESS': case 'INIT':   return 'var(--run)';
      case 'IN_REVIEW':                  return 'var(--review)';
      case 'FAILED': case 'REJECTED':    return 'var(--bad)';
      default:                           return 'var(--idle)';
    }
  }
  live(s: string) { return s === 'IN_PROGRESS' || s === 'INIT'; }
  short(n?: string) { return n ? (SHORT[n] ?? n.slice(0, 4)) : '—'; }
  pad(n: number) { return String(n).padStart(2, '0'); }
}
