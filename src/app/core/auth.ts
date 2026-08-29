import { Injectable, inject } from '@angular/core';
import { Session, Operator } from './session';

/* ===========================================================================
   Local account store.
   ---------------------------------------------------------------------------
   AxiomDSF has no auth server. Tenancy is a handle in the X-Axiom-User header,
   and the backend routes that handle to its own SQLite file and workspace
   tree. So this is a real credential check against accounts held on this
   device — not a server session, and it does not defend the API.

   WHAT IT IS
     Create an account, sign in, get the wrong password rejected. Enough that
     the machine is not one shared console, and enough that the handle behind
     the tenancy is chosen deliberately rather than typed fresh each time.

   WHAT IT IS NOT
     Anyone with filesystem or devtools access to this machine can read the
     account list and call the API directly with any handle. Treat it as a
     profile picker with a lock on it, not as a security boundary. Wiring real
     auth means an identity provider plus a server that validates the token
     before it trusts X-Axiom-User.

   PASSWORDS
     Never stored. PBKDF2-SHA-256, 210k iterations, 16-byte random salt per
     account, and only the derived key is written. Verification re-derives with
     the stored salt and compares in constant time. Web Crypto is required; on
     a browser without it (or a non-secure origin) account creation refuses
     rather than falling back to something weaker.
   =========================================================================== */

const ACCOUNTS = 'axiom.accounts';
const ITERATIONS = 210_000;

export interface Account {
  email: string;
  name: string;
  handle: string;
  salt: string;      // base64
  hash: string;      // base64, PBKDF2 output
  created: number;
  lastSeen: number;
}

export class AuthError extends Error {
  constructor(message: string, readonly field?: 'email' | 'password' | 'name' | 'confirm') {
    super(message);
    this.name = 'AuthError';
  }
}

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

@Injectable({ providedIn: 'root' })
export class Auth {
  private session = inject(Session);

  /** Web Crypto needs a secure context; localhost counts, plain http on a LAN IP does not. */
  readonly available = typeof crypto !== 'undefined' && !!crypto.subtle;

  // ------------------------------------------------------------------ store

  list(): Account[] {
    try {
      const raw = localStorage.getItem(ACCOUNTS);
      const a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch { return []; }
  }

  private write(list: Account[]) {
    try { localStorage.setItem(ACCOUNTS, JSON.stringify(list)); }
    catch { throw new AuthError('This browser is blocking local storage, so the account cannot be saved.'); }
  }

  find(email: string) {
    const e = email.trim().toLowerCase();
    return this.list().find(a => a.email === e);
  }

  has(email: string) { return !!this.find(email); }
  get any() { return this.list().length > 0; }

  // ------------------------------------------------------------------ crypto

  private async derive(password: string, salt: Uint8Array): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
      key, 256);
    return b64(bits);
  }

  /** Length-safe, branch-free compare so a wrong password cannot be timed out character by character. */
  private same(a: string, b: string) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  // ------------------------------------------------------------- validation

  /** Mirrors the server's UserContext.normalize, then guarantees uniqueness. */
  private handleFor(email: string, taken: Set<string>) {
    const base = Session.handleOf(email.split('@')[0] || 'operator');
    if (!taken.has(base)) return base;
    for (let i = 2; i < 500; i++) {
      const c = `${base}-${i}`;
      if (!taken.has(c)) return c;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  static emailOk(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()); }

  /** 0 to 4. Length carries most of the weight, because in practice it does. */
  static strength(p: string): number {
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 12) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
    else if (/\d/.test(p) || /[^A-Za-z0-9]/.test(p)) s += 0.5;
    return Math.min(4, Math.round(s));
  }

  static passwordProblem(p: string): string | null {
    if (p.length < 8) return 'Use at least 8 characters.';
    if (!/[A-Za-z]/.test(p)) return 'Include at least one letter.';
    if (!/\d/.test(p) && !/[^A-Za-z0-9]/.test(p)) return 'Include a number or a symbol.';
    return null;
  }

  // ---------------------------------------------------------------- actions

  async signUp(name: string, email: string, password: string): Promise<Operator> {
    if (!this.available) {
      throw new AuthError('Secure crypto is unavailable here, so an account cannot be created. Open the app over http://localhost or https.');
    }
    const n = name.trim();
    const e = email.trim().toLowerCase();
    if (!n) throw new AuthError('Enter your name.', 'name');
    if (!Auth.emailOk(e)) throw new AuthError('Enter a valid email address.', 'email');
    if (this.has(e)) throw new AuthError('An account already exists for this email. Sign in instead.', 'email');
    const bad = Auth.passwordProblem(password);
    if (bad) throw new AuthError(bad, 'password');

    const list = this.list();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const acc: Account = {
      email: e,
      name: n,
      handle: this.handleFor(e, new Set(list.map(a => a.handle))),
      salt: b64(salt.buffer as ArrayBuffer),
      hash: await this.derive(password, salt),
      created: Date.now(),
      lastSeen: Date.now(),
    };
    list.push(acc);
    this.write(list);
    return this.enter(acc);
  }

  async signIn(email: string, password: string): Promise<Operator> {
    if (!this.available) {
      throw new AuthError('Secure crypto is unavailable here. Open the app over http://localhost or https.');
    }
    const e = email.trim().toLowerCase();
    if (!Auth.emailOk(e)) throw new AuthError('Enter a valid email address.', 'email');
    const acc = this.find(e);

    // Derive even when the account is missing, so a wrong address and a wrong
    // password take the same time and cannot be told apart.
    const salt = acc ? unb64(acc.salt) : crypto.getRandomValues(new Uint8Array(16));
    const hash = await this.derive(password, salt);
    if (!acc || !this.same(hash, acc.hash)) {
      throw new AuthError('That email and password do not match an account on this device.', 'password');
    }

    acc.lastSeen = Date.now();
    this.write(this.list().map(a => (a.email === acc.email ? acc : a)));
    return this.enter(acc);
  }

  /** Changes the password for an account whose current password is known. */
  async changePassword(email: string, current: string, next: string) {
    const acc = this.find(email);
    if (!acc) throw new AuthError('No account for that email.', 'email');
    const ok = this.same(await this.derive(current, unb64(acc.salt)), acc.hash);
    if (!ok) throw new AuthError('Current password is wrong.', 'password');
    const bad = Auth.passwordProblem(next);
    if (bad) throw new AuthError(bad, 'password');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    acc.salt = b64(salt.buffer as ArrayBuffer);
    acc.hash = await this.derive(next, salt);
    this.write(this.list().map(a => (a.email === acc.email ? acc : a)));
  }

  /** Removes an account and its saved credentials. Workspace files are untouched. */
  forget(email: string) {
    this.write(this.list().filter(a => a.email !== email.trim().toLowerCase()));
  }

  private enter(acc: Account): Operator {
    const op: Operator = { name: acc.name, handle: acc.handle, email: acc.email, since: Date.now() };
    this.session.adopt(op);
    return op;
  }
}
