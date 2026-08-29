import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DevOpsService, DevOpsConnection, WorkItem, Repo } from '../services/devops.service';
import { SpotDirective, MagnetDirective } from '../core/ui';
import { Toaster } from '../core/toast';

/**
 * Azure DevOps bridge: connect, pull work items, list repositories.
 *
 * The PAT is held in memory for the session only and never written to storage —
 * the previous page kept it in a component field that survived navigation.
 */
@Component({
  selector: 'ax-devops',
  standalone: true,
  imports: [CommonModule, FormsModule, SpotDirective, MagnetDirective],
  template: `
  <div class="pg">
    <div class="head">
      <div><div class="tag">Bridge</div><h2>Azure DevOps</h2></div>
      <div class="conn">
        <i class="dot" [class.dot--beat]="busy()" [style.--c]="on() ? 'var(--ok)' : 'var(--idle)'"></i>
        <span class="tag">{{ on() ? 'connected' : 'offline' }}</span>
      </div>
    </div>

    <div class="cols">
      <section class="glass p lift" axSpot>
        <div class="tag">Connection</div>
        <label><span class="tag">Organisation</span>
          <input class="field" [(ngModel)]="c.organization" name="o" placeholder="contoso" autocomplete="off"/></label>
        <label><span class="tag">Project</span>
          <input class="field" [(ngModel)]="c.project" name="p" placeholder="platform" autocomplete="off"/></label>
        <label><span class="tag">Token</span>
          <input class="field" [(ngModel)]="c.pat" name="t" type="password"
                 placeholder="personal access token" autocomplete="off"/></label>
        <button class="btn btn--plasma full magnet" axMagnet="5" (click)="connect()" [disabled]="!ready() || busy()">
          {{ busy() ? 'Checking…' : 'Connect' }}
        </button>
        @if (msg()) { <div class="msg" [class.bad]="!on()">{{ msg() }}</div> }
        <p class="note">Held in memory for this session only.</p>
      </section>

      <section class="glass p lift" axSpot>
        <div class="t-row"><div class="tag">Work items</div>
          <button class="btn sm press" (click)="pull()" [disabled]="!on() || busy()">Pull</button></div>
        @if (items().length) {
          <ul class="list">
            @for (w of items(); track w.id) {
              <li><span class="mono li-id">{{ w.id }}</span>
                  <span class="li-t">{{ w.fields['System.Title'] }}</span>
                  <span class="tag">{{ w.fields['System.State'] }}</span></li>
            }
          </ul>
        } @else { <div class="void">{{ on() ? 'Nothing pulled' : 'Connect first' }}</div> }
      </section>

      <section class="glass p lift" axSpot>
        <div class="t-row"><div class="tag">Repositories</div>
          <button class="btn sm press" (click)="repos()" [disabled]="!on() || busy()">List</button></div>
        @if (rs().length) {
          <ul class="list">
            @for (r of rs(); track r.id) {
              <li><span class="li-t">{{ r.name }}</span>
                  <span class="mono tag">{{ kb(r.size) }}</span></li>
            }
          </ul>
        } @else { <div class="void">{{ on() ? 'Nothing listed' : 'Connect first' }}</div> }
      </section>
    </div>
  </div>
  `,
  styles: [`
    .pg { position:relative; z-index:1; }
    .head { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:18px; }
    .head h2 { margin-top:5px; }
    .conn { display:flex; align-items:center; gap:8px; }

    .cols { display:grid; gap:10px; grid-template-columns:320px 1fr 1fr; align-items:start; }
    @media (max-width:1000px){ .cols { grid-template-columns:1fr; } }
    .p { padding:16px 17px; display:flex; flex-direction:column; gap:10px; }
    .p label { display:flex; flex-direction:column; gap:5px; }
    .full { width:100%; }
    .sm { height:28px; padding:0 12px; font-size:11.5px; }
    .t-row { display:flex; align-items:center; justify-content:space-between; }

    .list { list-style:none; display:flex; flex-direction:column; gap:6px; max-height:340px; overflow:auto; }
    .list li { display:flex; align-items:center; gap:9px; padding:8px 10px;
               background:var(--raise); border-radius:var(--r-1); font-size:12.5px;
               transition:background .18s var(--ease), transform .18s var(--ease);  padding:6px 7px; margin:0 -7px; border-radius:var(--r-1); transition:background var(--t-hov) var(--ease); }
    @media (hover: hover) and (pointer: fine) { .list li:hover { background:var(--raise); } }
    .list li:hover { background:var(--raise-2); transform:translateX(3px); }
    .li-id { font-size:10px; color:var(--ink-4); }
    .li-t { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .void { color:var(--ink-4); font-size:12.5px; padding:26px 0; text-align:center; }
    .msg { font-size:12px; color:var(--ok); }
    .msg.bad { color:var(--bad); }
    .note { font-size:11px; color:var(--ink-4); }
  `],
})
export class DevOpsPage {
  private api = inject(DevOpsService);

  c: DevOpsConnection = { organization: '', project: '', pat: '' };
  on = signal(false);
  busy = signal(false);
  msg = signal('');
  items = signal<WorkItem[]>([]);
  rs = signal<Repo[]>([]);

  ready = () => !!(this.c.organization.trim() && this.c.project.trim() && this.c.pat.trim());

  connect() {
    if (!this.ready()) return;
    this.busy.set(true); this.msg.set('');
    this.api.getWorkItems(this.c, 'User Story').subscribe({
      next: r => { this.busy.set(false); this.on.set(true); this.items.set(r?.value ?? []);
                   this.msg.set(`Connected · ${r?.count ?? 0} work items`); },
      error: e => { this.busy.set(false); this.on.set(false);
                    this.msg.set(e?.error?.message ?? 'Could not reach that project.'); },
    });
  }

  pull() {
    this.busy.set(true);
    this.api.getWorkItems(this.c, 'User Story').subscribe({
      next: r => { this.busy.set(false); this.items.set(r?.value ?? []); },
      error: () => this.busy.set(false),
    });
  }

  repos() {
    this.busy.set(true);
    this.api.listRepos(this.c).subscribe({
      next: r => { this.busy.set(false); this.rs.set(r?.value ?? []); },
      error: () => this.busy.set(false),
    });
  }

  kb(n?: number) { return n ? `${Math.round(n / 1024)}K` : '—'; }
}
