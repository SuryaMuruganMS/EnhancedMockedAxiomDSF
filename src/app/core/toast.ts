import { Component, Injectable, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ToastKind = 'ok' | 'run' | 'bad' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** Optional second line — the detail nobody needs unless something went wrong. */
  note?: string;
  leaving?: boolean;
}

/**
 * Transient confirmations.
 *
 * An approval, a rework, a deleted workspace — actions whose result is a
 * server round trip the operator would otherwise have to infer from a list
 * quietly changing. Anything that must be acknowledged is a dialog, not this.
 */
@Injectable({ providedIn: 'root' })
export class Toaster {
  private seq = 0;
  readonly items = signal<Toast[]>([]);

  push(kind: ToastKind, text: string, note?: string, ms = 4200) {
    const id = ++this.seq;
    this.items.update(l => [...l, { id, kind, text, note }]);
    setTimeout(() => this.dismiss(id), ms);
    return id;
  }

  ok(t: string, n?: string)   { return this.push('ok', t, n); }
  run(t: string, n?: string)  { return this.push('run', t, n); }
  bad(t: string, n?: string)  { return this.push('bad', t, n, 6500); }
  info(t: string, n?: string) { return this.push('info', t, n); }

  /**
   * Marks the toast leaving, then removes it after the exit transition. The
   * flag drives the CSS rather than a timer removing the node outright, so the
   * exit is visible instead of a pop.
   */
  dismiss(id: number) {
    this.items.update(l => l.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => this.items.update(l => l.filter(t => t.id !== id)), 220);
  }
}

/** Mounted once in the shell. */
@Component({
  selector: 'ax-toasts',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tw" role="status" aria-live="polite">
      @for (t of toaster.items(); track t.id) {
        <div class="ts glass" [class.out]="t.leaving" [attr.data-k]="t.kind">
          <i class="ts-d"></i>
          <div class="ts-b">
            <div class="ts-t">{{ t.text }}</div>
            @if (t.note) { <div class="ts-n mono">{{ t.note }}</div> }
          </div>
          <button class="ts-x" (click)="toaster.dismiss(t.id)" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .tw {
      position:fixed; right:16px; bottom:16px; z-index:500;
      display:flex; flex-direction:column; gap:8px;
      width:min(340px, calc(100vw - 32px));
      pointer-events:none;
    }
    .ts {
      display:flex; align-items:flex-start; gap:10px;
      padding:11px 12px; pointer-events:auto;
      /* Enters from the edge it lives on, and leaves through the same edge. */
      transition:transform .22s var(--ease), opacity .22s var(--ease);
      animation:tsIn .24s var(--ease) both;
    }
    @keyframes tsIn { from { transform:translateY(10px); opacity:0; } }
    .ts.out { transform:translateY(8px); opacity:0; }

    .ts-d { width:6px; height:6px; border-radius:50%; margin-top:6px; flex:none;
            background:var(--idle); box-shadow:0 0 0 3px rgba(255,255,255,.05); }
    .ts[data-k="ok"]   .ts-d { background:var(--ok);     box-shadow:0 0 0 3px rgba(52,211,153,.18); }
    .ts[data-k="run"]  .ts-d { background:var(--run);    box-shadow:0 0 0 3px rgba(251,191,36,.18); }
    .ts[data-k="bad"]  .ts-d { background:var(--bad);    box-shadow:0 0 0 3px rgba(251,113,133,.18); }
    .ts[data-k="info"] .ts-d { background:var(--review); box-shadow:0 0 0 3px rgba(167,139,250,.18); }

    .ts-b { flex:1; min-width:0; }
    .ts-t { font-size:13.5px; color:var(--ink); line-height:1.45; }
    .ts-n { font-size:11.5px; color:var(--ink-4); margin-top:4px;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ts-x { color:var(--ink-4); font-size:11px; padding:2px 4px; border-radius:4px; flex:none;
            transition:color var(--t-hov) var(--ease), background var(--t-hov) var(--ease); }
    .ts-x:hover { color:var(--ink-2); background:var(--raise-2); }

    @media (prefers-reduced-motion: reduce) {
      .ts { animation:none; transition:opacity .15s linear; }
      .ts.out { transform:none; }
    }
  `],
})
export class Toasts {
  constructor(readonly toaster: Toaster) {}
}
