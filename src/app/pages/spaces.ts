import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WorkspaceService, Workspace } from '../services/workspace.service';
import { SpotDirective, RevealDirective, TiltDirective, MagnetDirective } from '../core/ui';
import { Waves } from '../core/waves';
import { Toaster } from '../core/toast';
import { MockApi } from '../mock/mock-api';

/**
 * Workspace index and creation, on one surface.
 *
 * Creating a workspace was a separate route with a full form page; it is two
 * fields. Folding it into a drawer here removes a navigation round trip from
 * the most common first action.
 */
@Component({
  selector: 'ax-spaces',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, SpotDirective, RevealDirective,
            TiltDirective, MagnetDirective, Waves],
  template: `
  <div class="pg" axReveal>
    <div class="head">
      <div><div class="tag">Spaces</div><h2>Workspaces</h2></div>
      <button class="btn btn--plasma magnet" axMagnet="6" (click)="drawer.set(!drawer())">
        {{ drawer() ? 'Close' : 'New space' }}
      </button>
    </div>

    @if (drawer()) {
      <form class="new glass rise" (ngSubmit)="create()">
        <div>
          <div class="tag">Choose a requirement</div>
          <p class="new-s">Each brief carries a full domain — actors, business rules, stories,
             known vulnerabilities — so all ten agents have something distinct to say about it.</p>
        </div>

        <div class="briefs">
          @for (b of catalog; track b.id) {
            <button type="button" class="bcard" [class.on]="draft.briefId === b.id"
                    (click)="pickBrief(b.id)">
              <span class="bc-t">{{ b.title }}</span>
              <span class="bc-d">{{ b.summary }}</span>
              <span class="bc-m">
                <span class="chip mono">{{ b.domain }}</span>
                <span class="chip mono">{{ b.stories.length }} stories</span>
                <span class="chip mono">{{ b.vulns.length }} vulns</span>
              </span>
            </button>
          }
        </div>

        <div class="new-g">
          <label><span class="tag">Workspace name</span>
            <input class="field" [(ngModel)]="draft.projectName" name="n" required
                   placeholder="payments-api" autocomplete="off"/></label>
          <label><span class="tag">Stack</span>
            <input class="field" [(ngModel)]="draft.techStack" name="s"
                   placeholder="Java, Spring Boot, Postgres" autocomplete="off"/></label>
        </div>
        <div class="new-a">
          <div class="seg2">
            @for (m of modes; track m.v) {
              <button type="button" class="seg2-b" [class.on]="draft.pipelineMode === m.v"
                      (click)="draft.pipelineMode = m.v">{{ m.k }}</button>
            }
          </div>
          <button class="btn btn--plasma" type="submit" [disabled]="!draft.projectName.trim() || busy()">
            {{ busy() ? 'Creating…' : 'Create workspace' }}
          </button>
        </div>
      </form>
    }

    @if (all().length > 3) {
      <input class="field find" [ngModel]="q()" (ngModelChange)="q.set($event)"
             name="q" placeholder="filter" aria-label="Filter workspaces"/>
    }

    @if (loading()) {
      <div class="grid">@for (i of [1,2,3]; track i) { <div class="shimmer sk"></div> }</div>
    } @else if (!shown().length) {
      <div class="empty glass">
        <ax-waves [count]="7" [intensity]="0.62" [spread]="0.7"/>
        <div class="empty-in">
        <h3 class="empty-h">{{ all().length ? 'Nothing matches that' : 'No workspaces yet' }}</h3>
        <p class="empty-p">
          {{ all().length
             ? 'Clear the filter to see the rest.'
             : 'A workspace is a project directory plus its own pipeline history.' }}
        </p>
        @if (!all().length) {
          <div class="empty-a">
            <button class="btn btn--plasma magnet" axMagnet="6" (click)="drawer.set(true)">Create one</button>
            <button class="btn press" (click)="seedDemo()">Load a finished run</button>
          </div>
          <p class="empty-h">
            "Load a finished run" drops in a completed ten-stage pipeline so the agent
            output is readable straight away.
          </p>
        } @else {
          <button class="btn press" (click)="q.set('')">Clear filter</button>
        }
        </div>
      </div>
    } @else {
      <div class="grid">
        @for (w of shown(); track w.id) {
          <article class="card glass glass--live glass--spot lift sheen tilt reveal"
                   axSpot axTilt="5"
                   [routerLink]="['/workspaces', w.id]" tabindex="0">
            <div class="c-top">
              <span class="mono c-id">{{ pad(w.id!) }}</span>
              <i class="dot" [style.--c]="w.status ? 'var(--ok)' : 'var(--idle)'"></i>
            </div>
            <h3>{{ w.projectName }}</h3>
            @if (w.description) { <p>{{ w.description }}</p> }
            @if (w.techStack) {
              <div class="chips">@for (t of stack(w.techStack); track t) { <span class="chip mono">{{ t }}</span> }</div>
            }
            <div class="c-foot">
              <span class="tag">{{ w.pipelineMode === 'full-sequence' ? 'Full' : 'Per story' }}</span>
              <button class="del" (click)="remove(w, $event)" [attr.aria-label]="'Delete ' + w.projectName">✕</button>
            </div>
          </article>
        }
      </div>
    }
  </div>
  `,
  styles: [`
    .pg { position:relative; z-index:1; }
    .head { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-bottom:18px; }
    .head h2 { margin-top:5px; }

    .new { padding:20px; margin-bottom:14px; display:flex; flex-direction:column; gap:14px; }
    .new-s { font-size:12.5px; color:var(--ink-3); margin-top:6px; max-width:66ch; line-height:1.6; }

    .briefs { display:grid; gap:7px; grid-template-columns:repeat(auto-fill,minmax(236px,1fr)); }
    .bcard { text-align:left; padding:13px 14px; border-radius:var(--r-1);
             background:var(--raise); border:1px solid transparent;
             display:flex; flex-direction:column; gap:6px;
             transition:background var(--t-hov) var(--ease), border-color var(--t-hov) var(--ease),
                        transform var(--t-hov) var(--ease); }
    @media (hover:hover) and (pointer:fine){
      .bcard:hover { background:var(--raise-2); transform:translateY(-2px); }
    }
    .bcard.on { background:var(--raise-3); border-color:var(--edge-live); }
    .bc-t { font-size:13px; color:var(--ink); font-weight:600; }
    .bc-d { font-size:11.5px; color:var(--ink-3); line-height:1.5; }
    .bc-m { display:flex; flex-wrap:wrap; gap:4px; margin-top:2px; }
    .bc-m .chip { font-size:9.5px; padding:2px 6px; border-radius:3px;
                  background:var(--sink); color:var(--ink-4); }

    .empty-a { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
    .empty-h { font-size:11.5px; color:var(--ink-4); max-width:46ch; margin-top:10px; line-height:1.55; }
    .new-g { display:grid; gap:12px; grid-template-columns:1fr 1fr; }
    @media (max-width:640px){ .new-g { grid-template-columns:1fr; } }
    .new label { display:flex; flex-direction:column; gap:5px; }
    .new-a { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }

    .seg2 { display:flex; gap:2px; padding:2px; background:var(--sink); border-radius:var(--r-1); }
    .seg2-b { padding:7px 13px; font-size:12px; border-radius:4px; color:var(--ink-3); }
    .seg2-b.on { background:var(--raise-3); color:var(--ink); }

    .find { max-width:280px; margin-bottom:14px; }

    .grid { display:grid; gap:10px; grid-template-columns:repeat(auto-fill,minmax(272px,1fr)); }
    .sk { height:172px; }

    .card { padding:17px 18px 13px; display:flex; flex-direction:column; gap:8px; cursor:pointer; min-height:172px; }
    .c-top { display:flex; align-items:center; justify-content:space-between; }
    .c-id { font-size:11px; color:var(--ink-4); }
    .card p { font-size:13.5px; color:var(--ink-3); flex:1;
              display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .chips { display:flex; flex-wrap:wrap; gap:4px; }
    .chip { font-size:11px; padding:3px 8px; border-radius:3px; background:var(--raise-2); color:var(--ink-3); }
    .c-foot { display:flex; align-items:center; justify-content:space-between;
              padding-top:10px; border-top:1px solid var(--edge); }
    .del { color:var(--ink-4); font-size:12px; padding:2px 5px; border-radius:4px;
           transition:color var(--t-hov) var(--ease), background var(--t-hov) var(--ease),
                      transform var(--t-press) var(--ease); }
    .del:hover { color:var(--bad); background:var(--raise-2); }
    .del:active { transform:scale(.96); }

    .empty { position:relative; isolation:isolate; overflow:hidden;
             padding:clamp(48px,7vw,88px) 32px; border-radius:var(--r-2); }
    .empty-in { position:relative; z-index:1; display:flex; flex-direction:column;
                align-items:center; gap:11px; text-align:center; }
    .empty-h { font-size:1.08rem; color:var(--ink); }
    .empty-p { font-size:13.5px; color:var(--ink-3); max-width:40ch; margin-bottom:6px; }
  `],
})
export class SpacesPage implements OnInit {
  private api = inject(WorkspaceService);
  private router = inject(Router);
  private toast = inject(Toaster);
  private mock = inject(MockApi);

  readonly catalog = this.mock.catalog;

  all = signal<Workspace[]>([]);
  loading = signal(true);
  drawer = signal(false);
  busy = signal(false);
  q = signal('');

  readonly modes = [{ k: 'Per story', v: 'per-story' }, { k: 'Full sequence', v: 'full-sequence' }];
  draft: Workspace = {
    projectName: this.catalog[0].title,
    description: this.catalog[0].summary,
    techStack: this.catalog[0].stack,
    pipelineMode: 'per-story',
    briefId: this.catalog[0].id,
  };

  /** Selecting a brief fills the name, stack and description from it. */
  pickBrief(id: string) {
    const b = this.mock.brief(id);
    this.draft = { ...this.draft, briefId: b.id, projectName: b.title,
                   description: b.summary, techStack: b.stack };
  }

  /** Seed a completed ten-stage run so the output is readable immediately. */
  seedDemo() {
    const id = this.mock.seedCompleted(this.catalog[0].id, 'full-sequence');
    this.load();
    this.toast.ok('Finished run loaded', 'Ten stages · SEC awaiting review');
    setTimeout(() => this.router.navigate(['/workspaces', id]), 350);
  }

  shown = computed(() => {
    const s = this.q().trim().toLowerCase();
    if (!s) return this.all();
    return this.all().filter(w =>
      [w.projectName, w.description, w.techStack].filter(Boolean)
        .some(f => f!.toLowerCase().includes(s)));
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.listWorkspaces().subscribe({
      next: w => { this.all.set(w ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  create() {
    if (!this.draft.projectName.trim() || this.busy()) return;
    this.busy.set(true);
    this.api.createWorkspace(this.draft).subscribe({
      next: w => {
        this.busy.set(false);
        this.drawer.set(false);
        this.draft = { projectName: '', description: '', techStack: '', pipelineMode: 'per-story' };
        this.all.update(l => [...l, w]);
        this.toast.ok(`Created ${w.projectName}`, `workspace ${w.id}`);
        this.router.navigate(['/workspaces', w.id]);
      },
      error: e => {
        this.busy.set(false);
        this.toast.bad('Could not create the workspace', e?.error?.message ?? 'request failed');
      },
    });
  }

  remove(w: Workspace, e: Event) {
    e.stopPropagation(); e.preventDefault();
    if (!confirm(`Delete ${w.projectName}?`)) return;
    this.api.deleteWorkspace(w.id!).subscribe({
      next: () => {
        this.all.update(l => l.filter(x => x.id !== w.id));
        this.toast.info(`Deleted ${w.projectName}`);
      },
      error: e => this.toast.bad('Could not delete the workspace', e?.error?.message ?? 'request failed'),
    });
  }

  stack(s: string) { return s.split(/[,;]/).map(x => x.trim()).filter(Boolean).slice(0, 5); }
  pad(n: number) { return String(n).padStart(2, '0'); }
}
