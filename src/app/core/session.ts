import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

const KEY = 'axiom.operator';

export interface Operator {
  /** Display name exactly as typed. */
  name: string;
  /** Filesystem/datasource-safe key. Must match UserContext.normalize on the server. */
  handle: string;
  /** Present for accounts created through the sign-in page. */
  email?: string;
  since: number;
}

/**
 * Who is signed in.
 *
 * The handle is the tenancy key: the server routes to data/users/<handle>/
 * for both the SQLite file and the workspace tree, so two operators on the
 * same install never share state.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private router = inject(Router);

  readonly operator = signal<Operator | null>(this.restore());
  readonly isIn = computed(() => this.operator() !== null);

  /** Mirror of the server's UserContext.normalize. */
  static handleOf(raw: string): string {
    const s = (raw || '').trim().toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
    return (s || 'default').slice(0, 48);
  }

  signIn(name: string): boolean {
    const clean = (name || '').trim();
    if (!clean) return false;
    const op: Operator = { name: clean, handle: Session.handleOf(clean), since: Date.now() };
    this.operator.set(op);
    try { localStorage.setItem(KEY, JSON.stringify(op)); } catch { /* private mode */ }
    this.router.navigateByUrl('/console');
    return true;
  }

  /**
   * Take an operator that has already been authenticated by Auth. Kept
   * separate from signIn so the credential check has exactly one home and
   * this class stays the store of who is currently in.
   */
  adopt(op: Operator): void {
    this.operator.set(op);
    try { localStorage.setItem(KEY, JSON.stringify(op)); } catch { /* private mode */ }
    this.router.navigateByUrl('/console');
  }

  signOut(): void {
    this.operator.set(null);
    try { localStorage.removeItem(KEY); } catch { /* private mode */ }
    this.router.navigateByUrl('/');
  }

  private restore(): Operator | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      return o?.handle ? o as Operator : null;
    } catch { return null; }
  }
}
