import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WorkspaceService, Workspace } from '../services/workspace.service';
import { WorkflowService } from '../services/workflow.service';
import { SpotDirective, MagnetDirective } from '../core/ui';
import { Toaster } from '../core/toast';
import { MockApi } from '../mock/mock-api';
import { Brief } from '../mock/catalog';

/**
 * Start a run.
 *
 * The requirement is chosen from the catalogue rather than typed. Six briefs
 * ship with the build, each a real problem domain with enough substance for
 * ten agents to say something different about it — which is the point of the
 * demo. The text remains editable so a viewer can see it is a requirement,
 * not a menu item.
 */
@Component({
  selector: 'ax-newrun',
  standalone: true,
  imports: [CommonModule, FormsModule, SpotDirective, MagnetDirective],
  template: `
  <div class="pg">
    <div class="head">
      <div><div class="tag">Start</div><h2>New run</h2></div>
      <div class="tag mono">{{ catalog.length }} requirements available</div>
    </div>

    <div class="cols">
      <!-- ---------------- target + mode ---------------- -->
      <section class="glass pane" axSpot>
        <div class="tag">Target workspace</div>
        @if (spaces().length) {
          <div class="picks">
            @for (w of spaces(); track w.id) {
              <button class="pick" [class.on]="target() === w.id" (click)="target.set(w.id!)">
                <span class="mono p-id">{{ pad(w.id!) }}</span>
                <span class="p-n">{{ w.projectName }}</span>
                @if (w.techStack) { <span class="p-s mono">{{ w.techStack.split(',')[0].trim() }}</span> }
              </button>
            }
          </div>
        } @else {
          <div class="void">No workspaces yet — <a class="lnk" (click)="goSpaces()">create one</a>.</div>
        }

        <div class="tag mt">Pipeline mode</div>
        <div class="modes">
          @for (m of modes; track m.v) {
            <button class="mode" [class.on]="mode() === m.v" (click)="mode.set(m.v)">
              <span class="mode-k">{{ m.k }}</span>
              <span class="mode-d">{{ m.d }}</span>
            </button>
          }
        </div>
      </section>

      <!-- ---------------- requirement ---------------- -->
      <section class="glass pane" axSpot>
        <div class="r-top">
          <div class="tag">Requirement</div>
          <div class="sel-w">
            <select class="sel" [ngModel]="briefId()" (ngModelChange)="choose($event)" name="brief"
                    aria-label="Choose a requirement">
              @for (b of catalog; track b.id) {
                <option [value]="b.id">{{ b.title }}</option>
              }
            </select>
            <span class="sel-c" aria-hidden="true">▾</span>
          </div>
        </div>

        @if (brief(); as b) {
          <div class="brief">
            <div class="b-top">
              <span class="chip mono">{{ b.domain }}</span>
              <span class="chip mono">{{ b.stack.split(',')[0] }}</span>
              <span class="chip mono">{{ b.stories.length }} stories</span>
              <span class="chip mono">{{ b.rules.length }} rules</span>
            </div>
            <p class="b-s">{{ b.summary }}</p>
            <div class="b-m">
              @for (m of b.metrics; track m.k) {
                <div class="bm"><span class="bm-v mono">{{ m.v }}</span><span class="bm-k">{{ m.k }}</span></div>
              }
            </div>
          </div>
        }

        <textarea class="ta" [(ngModel)]="text" name="r" rows="14"
                  spellcheck="false"
                  placeholder="Describe what the system must do."></textarea>

        <div class="meta">
          <span class="mono m-c">{{ text.length }} chars · {{ words() }} words</span>
          <button class="btn btn--plasma magnet" axMagnet="7"
                  [disabled]="!ready() || busy()" (click)="start()">
            {{ busy() ? 'Starting…' : 'Run the line' }}
          </button>
        </div>
        @if (err()) { <div class="err">{{ err() }}</div> }
      </section>
    </div>
  </div>
  `,
  styles: [`
    .pg { position:relative; z-index:1; }
    .head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:18px; }
    .head h2 { margin-top:5px; }
    .cols { display:grid; gap:10px; grid-template-columns:minmax(0,340px) minmax(0,1fr); align-items:start; }
    .cols > * { min-width:0; }
    @media (max-width:960px){ .cols { grid-template-columns:1fr; } }
    .pane { padding:18px 19px; }
    .mt { display:block; margin-top:20px; }
    .void { color:var(--ink-4); font-size:13px; padding:12px 0; }
    .lnk { color:var(--plasma-b); cursor:pointer; text-decoration:underline; }

    .picks { display:flex; flex-direction:column; gap:5px; margin-top:10px; max-height:290px; overflow:auto; }
    .pick { display:flex; align-items:center; gap:10px; padding:11px 12px; border-radius:var(--r-1);
            background:var(--raise); text-align:left;
            transition:background var(--t-hov) var(--ease), transform var(--t-hov) var(--ease); }
    @media (hover:hover) and (pointer:fine){ .pick:hover { background:var(--raise-2); transform:translateX(3px); } }
    .pick.on { background:var(--raise-3); box-shadow:inset 2px 0 0 var(--plasma-solid); }
    .p-id { font-size:11px; color:var(--ink-4); }
    .p-n { flex:1; font-size:13.5px; }
    .p-s { font-size:11px; color:var(--ink-4); }

    .modes { display:grid; gap:6px; margin-top:10px; }
    .mode { text-align:left; padding:12px 13px; border-radius:var(--r-1); background:var(--raise);
            transition:background var(--t-hov) var(--ease); }
    .mode:hover { background:var(--raise-2); }
    .mode.on { background:var(--raise-3); box-shadow:inset 2px 0 0 var(--plasma-solid); }
    .mode-k { display:block; font-size:13px; color:var(--ink); }
    .mode-d { display:block; font-size:11.5px; color:var(--ink-4); margin-top:3px; line-height:1.5; }

    .r-top { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
    .sel-w { position:relative; }
    .sel { appearance:none; background:var(--sink); border:1px solid var(--edge); color:var(--ink);
           font-size:12.5px; padding:8px 30px 8px 12px; border-radius:var(--r-1); cursor:pointer;
           max-width:min(340px, 60vw);
           transition:border-color var(--t-hov) var(--ease); }
    .sel:hover, .sel:focus { border-color:var(--edge-live); outline:none; }
    .sel option { background:#0b0d14; color:var(--ink); }
    .sel-c { position:absolute; right:11px; top:50%; transform:translateY(-50%);
             pointer-events:none; color:var(--ink-4); font-size:10px; }

    .brief { margin-top:14px; padding:14px 15px; border-radius:var(--r-1);
             background:var(--raise); border:1px solid var(--edge); }
    .b-top { display:flex; flex-wrap:wrap; gap:5px; }
    .chip { font-size:10.5px; padding:3px 8px; border-radius:3px; background:var(--raise-2); color:var(--ink-3); }
    .b-s { font-size:13px; color:var(--ink-2); margin-top:10px; line-height:1.6; }
    .b-m { display:flex; flex-wrap:wrap; gap:16px; margin-top:13px; padding-top:12px; border-top:1px solid var(--edge); }
    .bm { display:flex; flex-direction:column; gap:2px; }
    .bm-v { font-size:14px; color:var(--ink); font-weight:600; }
    .bm-k { font-size:10.5px; color:var(--ink-4); }

    .ta { width:100%; margin-top:12px; padding:14px 15px; resize:vertical;
          background:var(--sink); border:1px solid var(--edge); border-radius:var(--r-1);
          color:var(--ink-2); font-size:13px; line-height:1.7; font-family:var(--f-ui);
          transition:border-color var(--t-hov) var(--ease); }
    .ta:focus { outline:none; border-color:var(--edge-live); box-shadow:0 0 0 3px rgba(139,92,246,.15); }
    .ta::placeholder { color:var(--ink-4); }
    .meta { display:flex; align-items:center; justify-content:space-between; margin-top:13px; gap:14px; }
    .m-c { font-size:11.5px; color:var(--ink-4); }
    .err { margin-top:11px; padding:11px 13px; border-radius:var(--r-1);
           background:rgba(251,113,133,.1); color:var(--bad); font-size:12.5px; }
  `],
})
export class NewRunPage implements OnInit {
  private wsApi = inject(WorkspaceService);
  private wfApi = inject(WorkflowService);
  private router = inject(Router);
  private toast = inject(Toaster);
  private mock = inject(MockApi);

  readonly catalog = this.mock.catalog;
  readonly modes = [
    { k: 'Per story', v: 'per-story',
      d: 'REQ→US once, then every user story gets its own TR→SEC pipeline.' },
    { k: 'Full sequence', v: 'full-sequence',
      d: 'One requirement straight through all ten stages.' },
  ];

  spaces = signal<Workspace[]>([]);
  target = signal<number | null>(null);
  mode = signal('per-story');
  briefId = signal(this.catalog[0].id);
  busy = signal(false);
  err = signal('');
  text = this.catalog[0].requirement;

  brief = computed<Brief>(() => this.mock.brief(this.briefId()));
  words = () => (this.text.trim().match(/\S+/g) ?? []).length;
  ready = () => this.target() !== null && this.text.trim().length > 40;

  ngOnInit() {
    this.wsApi.listWorkspaces().subscribe(w => {
      this.spaces.set(w ?? []);
      if (w?.length) {
        this.target.set(w[0].id!);
        // Default the requirement and mode to whatever that workspace runs.
        const first = this.mock.spaces().find(s => s.id === w[0].id);
        if (first) { this.choose(first.briefId); this.mode.set(first.pipelineMode); }
      }
    });
  }

  choose(id: string) {
    this.briefId.set(id);
    this.text = this.mock.brief(id).requirement;
  }
  goSpaces() { this.router.navigate(['/workspaces']); }

  start() {
    if (!this.ready() || this.busy()) return;
    this.busy.set(true); this.err.set('');
    this.wfApi.startWorkflow({
      workspaceId: this.target()!,
      requirementText: this.text.trim(),
      pipelineMode: this.mode(),
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.run('Line started', `REQ is running · ${this.mode()}`);
        this.router.navigate(['/workspaces', this.target()]);
      },
      error: e => {
        this.busy.set(false);
        const m = e?.error?.message ?? 'Could not start the run.';
        this.err.set(m); this.toast.bad('Could not start the run', m);
      },
    });
  }

  pad(n: number) { return String(n).padStart(2, '0'); }
}
