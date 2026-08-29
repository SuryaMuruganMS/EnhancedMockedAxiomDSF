import { Component, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Session } from './core/session';
import { AmbientField, ScrollProgress, CursorGlow, MagnetDirective } from './core/ui';
import { Toasts, Toaster } from './core/toast';
import { MockApi } from './mock/mock-api';
import { EnterPage } from './pages/enter';

/**
 * One row in the command palette. `p` doubles as the track key and, for a
 * `go` command, the route. `s` is the group shown on the right.
 */
interface Cmd { p: string; k: string; g: string; s: string; do?: () => void; }

/**
 * Application shell.
 *
 * Signed out, the whole viewport is the front door. Signed in, a narrow rail
 * plus a content column. The ambient field sits behind both so the two states
 * feel like one surface rather than two apps.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, AmbientField, EnterPage,
            ScrollProgress, CursorGlow, Toasts, MagnetDirective],
  template: `
  <ax-field/>
  <ax-cursor-glow/>
  <ax-scroll-progress/>
  <ax-toasts/>

  @if (!session.isIn()) {
    <ax-enter/>
  } @else {
    <div class="shell">
      <aside class="rail">
        <a class="brand" routerLink="/console">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 L21 20 H3 Z" fill="none" stroke="url(#rg)" stroke-width="1.6" stroke-linejoin="round"/>
            <path d="M8.4 14.4 H15.6" stroke="url(#rg)" stroke-width="1.6"/>
            <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#22D3EE"/>
            </linearGradient></defs>
          </svg>
          <b>AXIOM</b>
        </a>

        <nav>
          @for (n of nav; track n.p) {
            <a [routerLink]="n.p" routerLinkActive="on" class="nl press">
              <span class="nl-g" aria-hidden="true">{{ n.g }}</span>{{ n.k }}
            </a>
          }
        </nav>

        <div class="demo">
          <div class="demo-t">
            <i class="demo-d"></i><span class="mono">DEMO BUILD</span>
          </div>
          <p class="demo-s">Fully mocked. No backend, no API keys — every agent
             output is generated in the browser.</p>
          <button class="demo-b press" (click)="reset()">Reset demo data</button>
        </div>

        <div class="who">
          <div class="who-h mono">{{ session.operator()?.handle }}</div>
          <button class="who-o" (click)="session.signOut()">Sign out</button>
        </div>
      </aside>

      <main class="main"><router-outlet/></main>
    </div>
  }

  @if (kbar()) {
    <div class="kb" (click)="kbar.set(false)">
      <div class="kb-p glass" (click)="$event.stopPropagation()">
        <input class="kb-i" #kbi [value]="q()" (input)="onQ($event)" (keydown)="onKey($event)"
               placeholder="Search commands…" aria-label="Command"/>
        <div class="kb-l">
          @for (n of hits(); track n.p; let i = $index) {
            <button class="kb-r" [class.on]="i === cur()"
                    (pointerenter)="cur.set(i)" (click)="run(n)">
              <span class="nl-g">{{ n.g }}</span>
              <span class="kb-k">{{ n.k }}</span>
              <span class="kb-s">{{ n.s }}</span>
            </button>
          }
          @if (!hits().length) { <div class="kb-e">No command matches</div> }
        </div>
        <div class="kb-f">
          <span><b class="mono">↑↓</b> move</span>
          <span><b class="mono">⏎</b> run</span>
          <span><b class="mono">esc</b> close</span>
        </div>
      </div>
    </div>
  }
  `,
  styles: [`
    .shell { position:relative; z-index:1; display:grid; grid-template-columns:var(--rail) 1fr; min-height:100dvh; }
    .rail {
      position:sticky; top:0; height:100dvh;
      display:flex; flex-direction:column; gap:26px;
      padding:18px 14px;
      border-right:1px solid var(--edge);
      backdrop-filter:blur(14px);
    }
    .brand { display:flex; align-items:center; gap:9px; padding:6px 8px; font-family:var(--f-display);
             letter-spacing:.14em; font-size:12.5px;
             transition:transform var(--t-hov) var(--ease); }
    @media (hover: hover) and (pointer: fine) { .brand:hover { transform:translateX(2px); } }
    .brand svg { width:19px; height:19px; }

    nav { display:flex; flex-direction:column; gap:2px; }
    .nl {
      display:flex; align-items:center; gap:11px;
      padding:9px 10px; border-radius:var(--r-1);
      font-size:13.5px; color:var(--ink-3);
      transition:color .18s var(--ease), background .18s var(--ease);
    }
    @media (hover: hover) and (pointer: fine) {
      .nl:hover { color:var(--ink); background:var(--raise); }
      .nl:hover .nl-g { transform:scale(1.18); }
    }
    .nl:active { transform:scale(.98); }
    .nl.on { color:var(--ink); background:var(--raise-2); box-shadow:inset 2px 0 0 var(--plasma-solid); }
    .nl-g { width:16px; text-align:center; font-family:var(--f-mono); font-size:12px; opacity:.85;
            transition:transform var(--t-hov) var(--ease); }

    .demo { margin-top:auto; padding:12px; border-radius:var(--r-1);
            background:var(--raise); border:1px solid var(--edge); }
    .demo-t { display:flex; align-items:center; gap:7px; font-size:10px;
              letter-spacing:.14em; color:var(--ink-2); }
    .demo-d { width:6px; height:6px; border-radius:50%; background:var(--plasma-solid);
              box-shadow:0 0 0 3px rgba(139,92,246,.18); flex:none;
              animation:demoPulse 2.4s var(--ease-soft) infinite; }
    @keyframes demoPulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
    .demo-s { font-size:11px; color:var(--ink-4); line-height:1.5; margin-top:7px; }
    .demo-b { margin-top:9px; font-size:11px; color:var(--ink-3);
              padding:5px 9px; border-radius:5px; background:var(--sink);
              transition:color var(--t-hov) var(--ease), background var(--t-hov) var(--ease); }
    .demo-b:hover { color:var(--ink); background:var(--raise-2); }
    @media (prefers-reduced-motion: reduce) { .demo-d { animation:none; } }
    @media (max-width:820px){ .demo { display:none; } }

    .who { padding:10px; border-top:1px solid var(--edge); }
    .who-h { font-size:12.5px; color:var(--ink-2); }
    .who-o { margin-top:6px; font-size:12px; color:var(--ink-4);
             transition:color var(--t-hov) var(--ease); }
    .who-o:hover { color:var(--bad); }
    .who-h { transition:color var(--t-hov) var(--ease); }

    .main { min-width:0; }

    /* command bar */
    .kb { position:fixed; inset:0; z-index:300; background:rgba(4,5,9,.7); backdrop-filter:blur(6px);
          display:flex; justify-content:center; padding-top:14vh; }
    .kb-p { width:min(520px,92vw); overflow:hidden; }
    .kb-i { width:100%; height:50px; padding:0 16px; border-bottom:1px solid var(--edge); font-size:15px; }
    .kb-i:focus { outline:none; }
    .kb-l { padding:6px; max-height:44vh; overflow:auto; }
    .kb-r { width:100%; display:flex; align-items:center; gap:11px; padding:9px 11px;
            border-radius:var(--r-1); font-size:13px; color:var(--ink-2); text-align:left;
            transition:background var(--t-hov) var(--ease), color var(--t-hov) var(--ease); }
    .kb-r.on { background:var(--raise-2); color:var(--ink); }
    .kb-k { flex:1; }
    .kb-s { font-family:var(--f-mono); font-size:11px; letter-spacing:.1em;
            text-transform:uppercase; color:var(--ink-4); }
    .kb-e { padding:18px; text-align:center; color:var(--ink-4); font-size:12px; }
    .kb-f { display:flex; gap:16px; padding:10px 14px; border-top:1px solid var(--edge);
            font-size:11.5px; color:var(--ink-4); }
    .kb-f b { color:var(--ink-3); font-weight:500; }

    @media (max-width:820px){
      .shell { grid-template-columns:1fr; }
      .rail { position:static; height:auto; flex-direction:row; align-items:center; gap:14px; overflow-x:auto; }
      .rail nav { flex-direction:row; }
      .who { margin:0 0 0 auto; border:0; padding:0; }
    }
  `],
})
export class AppShell {
  readonly session = inject(Session);
  private router = inject(Router);
  private mock = inject(MockApi);
  private toaster = inject(Toaster);

  /** The rail. Navigation only — every entry is a destination. */
  readonly nav: Cmd[] = [
    { p: '/console',    k: 'Console',  g: '▚', s: 'go' },
    { p: '/agents',     k: 'Agents',   g: '◈', s: 'go' },
    { p: '/workspaces', k: 'Spaces',   g: '▤', s: 'go' },
    { p: '/run',        k: 'New run',  g: '▶', s: 'go' },
    { p: '/runs',       k: 'Runs',     g: '◉', s: 'go' },
    { p: '/devops',     k: 'DevOps',   g: '⎈', s: 'go' },
  ];

  /**
   * Everything the palette can reach: the rail, plus the actions that have no
   * home on it. Actions carry a `do`, destinations do not.
   */
  private get commands(): Cmd[] {
    return [
      ...this.nav,
      { p: '#reload',  k: 'Reload data',  g: '↻', s: 'act', do: () => location.reload() },
      { p: '#top',     k: 'Back to top',  g: '↑', s: 'act',
        do: () => scrollTo({ top: 0, behavior: 'smooth' }) },
      { p: '#seed',    k: 'Load a finished run', g: '⚡', s: 'demo',
        do: () => this.seedDemo() },
      { p: '#reset',   k: 'Reset demo data',    g: '⟲', s: 'demo',
        do: () => this.reset() },
      { p: '#out',     k: 'Sign out',     g: '⏻', s: 'act', do: () => this.session.signOut() },
    ];
  }

  kbar = signal(false);
  q = signal('');
  cur = signal(0);

  hits = () => {
    const s = this.q().trim().toLowerCase();
    const all = this.commands;
    return s ? all.filter(n => n.k.toLowerCase().includes(s)) : all;
  };

  @HostListener('window:keydown', ['$event'])
  key(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.kbar.update(v => !v); this.q.set(''); this.cur.set(0);
    }
    if (e.key === 'Escape') this.kbar.set(false);
  }
  onQ(e: Event) { this.q.set((e.target as HTMLInputElement).value); this.cur.set(0); }
  onKey(e: KeyboardEvent) {
    const n = this.hits().length; if (!n) return;
    if (e.key === 'ArrowDown') { this.cur.update(v => (v + 1) % n); e.preventDefault(); }
    if (e.key === 'ArrowUp')   { this.cur.update(v => (v - 1 + n) % n); e.preventDefault(); }
    if (e.key === 'Enter')     { this.run(this.hits()[this.cur()]); e.preventDefault(); }
  }

  /** Clears every workspace and run. The demo is meant to be re-run. */
  reset() {
    this.mock.reset();
    this.toaster.info('Demo data cleared', 'Create a workspace to start again');
    this.router.navigateByUrl('/console');
  }

  /** Drops in a completed ten-stage pipeline and opens it. */
  seedDemo() {
    const id = this.mock.seedCompleted(this.mock.catalog[0].id, 'full-sequence');
    this.toaster.ok('Finished run loaded', 'Ten stages · SEC awaiting review');
    this.router.navigate(['/workspaces', id]);
  }

  /** A command either does something or goes somewhere. */
  run(c?: Cmd) {
    if (!c) return;
    this.kbar.set(false);
    if (c.do) c.do();
    else this.router.navigateByUrl(c.p);
  }
}
