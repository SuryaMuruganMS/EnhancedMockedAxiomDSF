import {
  Component, inject, signal, computed, ElementRef, ViewChild,
  AfterViewInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Session } from '../core/session';
import { Auth, AuthError } from '../core/auth';
import { Toaster } from '../core/toast';
import {
  SpotDirective, RevealDirective, TiltDirective, MagnetDirective,
  ScrambleDirective, CountUp,
} from '../core/ui';
import { Ticker } from '../core/widgets';
import { TraceHero, Region } from '../core/trace-hero';
import { Waves } from '../core/waves';
import { MockApi } from '../mock/mock-api';

type Mode = 'in' | 'up';

/**
 * The front door: what Axiom is, then the door itself.
 *
 * The opening is a scroll-driven stage. A plasma trace routes across the
 * viewport through the ten stages as the operator scrolls, and when the route
 * completes the copy hands off to the account card — so the act of getting to
 * the sign-in is the product explaining itself.
 *
 * Two things are computed once here and passed down, so nothing can drift:
 * scroll progress (the scene, the copy fade and the readout all read it) and
 * the trace's allowed region (the copy column is reserved out of it, or the
 * route draws pads straight through the headline).
 */
@Component({
  selector: 'ax-enter',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    SpotDirective, RevealDirective, TiltDirective, MagnetDirective,
    ScrambleDirective, CountUp, Ticker, TraceHero, Waves,
  ],
  template: `
  <div class="enter" axReveal>

    <header class="bar">
      <div class="logo">
        <svg viewBox="0 0 24 24" class="glyph" aria-hidden="true">
          <path d="M12 2 L21 20 H3 Z" fill="none" stroke="url(#lg)" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M8.4 14.4 H15.6" stroke="url(#lg)" stroke-width="1.6"/>
          <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#22D3EE"/>
          </linearGradient></defs>
        </svg>
        <b>AXIOM</b>
      </div>
      <nav class="bar-n">
        <a href="#line" class="bl etrace">The line</a>
        <a href="#output" class="bl etrace">Output</a>
        <a href="#catalogue" class="bl etrace">Requirements</a>
        <button class="btn btn--quiet press" (click)="jumpToDoor('in')">Sign in</button>
        <button class="btn btn--plasma press" (click)="jumpToDoor('up')">Get started</button>
      </nav>
    </header>

    <!-- ================= scroll stage =================
         Tall section, sticky viewport. Scroll draws the trace; the trace
         finishing is what brings the account card up. -->
    <section class="stage" #stage>
      <div class="stick">
        <ax-trace [progress]="prog()" [region]="region()" (lit)="lit.set($event)"/>

        <div class="stage-in">
          <div class="copy" [style.opacity]="copyO()" [style.visibility]="copyO() < .02 ? 'hidden' : 'visible'"
               [style.transform]="'translate3d(0,' + copyY() + 'px,0)'">
            <div class="tag rise">Ten agents · one requirement</div>
            <h1>
              <span class="wipe"><span style="animation-delay:.06s">Ship the</span></span>
              <span class="wipe"><span style="animation-delay:.15s" class="grad">engineering record,</span></span>
              <span class="wipe"><span style="animation-delay:.24s">not just the code.</span></span>
            </h1>
            <p class="sub rise">
              A requirement enters the line and leaves as refined scope, architecture,
              stories, tests, implementation and a security audit — with your approval
              required at every one of the ten gates.
            </p>
          </div>

          <!-- ---------- account card ---------- -->
          <div class="doorw" [class.on]="doorOn()" [style.opacity]="doorO()"
               [style.transform]="'translate3d(0,' + doorY() + 'px,0)'">
            <div class="auth glass" #authCard>
              <div class="au-h">
                <h2 class="au-t">{{ mode() === 'in' ? 'Sign in' : 'Create your account' }}</h2>
                <p class="au-s">
                  {{ mode() === 'in'
                     ? 'Your handle selects the database and workspace tree the line runs against.'
                     : 'Your email becomes a private handle, database and workspace tree on this machine.' }}
                </p>
              </div>

              <div class="tabs" role="tablist">
                <button class="tab" role="tab" [attr.aria-selected]="mode() === 'in'"
                        [class.on]="mode() === 'in'" (click)="setMode('in')">Sign in</button>
                <button class="tab" role="tab" [attr.aria-selected]="mode() === 'up'"
                        [class.on]="mode() === 'up'" (click)="setMode('up')">Create account</button>
                <span class="tab-ink" [style.transform]="'translateX(' + (mode() === 'in' ? 0 : 100) + '%)'"></span>
              </div>

              <form class="au-f" (ngSubmit)="submit()" novalidate>
                @if (mode() === 'up') {
                  <label class="fl">
                    <span class="fl-k">Name</span>
                    <input class="field" name="name" [(ngModel)]="f.name" autocomplete="name"
                           placeholder="Ada Lovelace" [class.bad]="err()?.field === 'name'"
                           [attr.tabindex]="doorOn() ? null : -1"/>
                  </label>
                }

                <label class="fl">
                  <span class="fl-k">Email</span>
                  <input class="field" name="email" type="email" [(ngModel)]="f.email"
                         autocomplete="email" inputmode="email" spellcheck="false"
                         placeholder="you@company.com" [class.bad]="err()?.field === 'email'"
                         [attr.tabindex]="doorOn() ? null : -1"/>
                </label>

                <label class="fl">
                  <span class="fl-k">
                    Password
                    @if (mode() === 'in') {
                      <button type="button" class="fl-a" (click)="forgot()">Forgot?</button>
                    }
                  </span>
                  <span class="fw">
                    <input class="field" name="password" [type]="show() ? 'text' : 'password'"
                           [(ngModel)]="f.password"
                           [attr.autocomplete]="mode() === 'in' ? 'current-password' : 'new-password'"
                           placeholder="{{ mode() === 'in' ? 'Your password' : 'At least 8 characters' }}"
                           [class.bad]="err()?.field === 'password'"
                           [attr.tabindex]="doorOn() ? null : -1"/>
                    <button type="button" class="eye" (click)="show.set(!show())"
                            [attr.aria-label]="show() ? 'Hide password' : 'Show password'"
                            [attr.tabindex]="doorOn() ? null : -1">
                      {{ show() ? 'Hide' : 'Show' }}
                    </button>
                  </span>
                  @if (mode() === 'up' && f.password) {
                    <span class="pw">
                      <span class="pw-b">
                        @for (i of [0,1,2,3]; track i) {
                          <i [class.on]="strength() > i" [style.--c]="strengthColor()"></i>
                        }
                      </span>
                      <span class="pw-l" [style.color]="strengthColor()">{{ strengthLabel() }}</span>
                    </span>
                  }
                </label>

                @if (mode() === 'up') {
                  <label class="fl">
                    <span class="fl-k">Confirm password</span>
                    <input class="field" name="confirm" [type]="show() ? 'text' : 'password'"
                           [(ngModel)]="f.confirm" autocomplete="new-password"
                           placeholder="Type it again" [class.bad]="err()?.field === 'confirm'"
                           [attr.tabindex]="doorOn() ? null : -1"/>
                  </label>

                  <label class="ck">
                    <input type="checkbox" name="terms" [(ngModel)]="f.terms"
                           [attr.tabindex]="doorOn() ? null : -1"/>
                    <span>I understand this account is stored on this device only.</span>
                  </label>
                } @else {
                  <label class="ck">
                    <input type="checkbox" name="remember" [(ngModel)]="f.remember"
                           [attr.tabindex]="doorOn() ? null : -1"/>
                    <span>Keep me signed in on this machine</span>
                  </label>
                }

                @if (err()) {
                  <div class="au-e" role="alert">{{ err()!.message }}</div>
                }

                <button class="btn btn--plasma au-go magnet" type="submit" axMagnet="6"
                        [disabled]="busy()" [attr.tabindex]="doorOn() ? null : -1">
                  {{ busy() ? 'Working…' : (mode() === 'in' ? 'Sign in' : 'Create account') }}
                </button>
              </form>

              <div class="au-or"><span>or</span></div>

              <div class="au-sso">
                <button class="sso" type="button" disabled title="Needs a Google OAuth client ID and a server callback">
                  <svg viewBox="0 0 24 24" class="sso-g" aria-hidden="true">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.7 3-4.3 3-7.3 0-.7-.1-1.4-.2-2.1H12z"/>
                    <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.2H3v2.6A10 10 0 0 0 12 22z"/>
                    <path fill="#FBBC05" d="M6.2 13.8a6 6 0 0 1 0-3.8V7.4H3a10 10 0 0 0 0 9z"/>
                    <path fill="#4285F4" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3 7.4L6.2 10c.8-2.4 3.1-4 5.8-4z"/>
                  </svg>
                  Continue with Google
                </button>
                <p class="sso-n">
                  Google sign-in is off until an OAuth client ID and a server callback exist —
                  AxiomDSF has no auth server yet.
                </p>
              </div>

              <p class="au-f2">
                {{ mode() === 'in' ? 'New here?' : 'Already have an account?' }}
                <button type="button" class="lk" (click)="setMode(mode() === 'in' ? 'up' : 'in')">
                  {{ mode() === 'in' ? 'Create an account' : 'Sign in' }}
                </button>
              </p>
            </div>
          </div>
        </div>

        <!-- routed-so-far readout, straight from the scene -->
        <div class="hud mono" aria-hidden="true">
          <span class="hud-n">{{ pad(lit()) }}</span><span class="hud-d">/10</span>
          <span class="hud-l">{{ lit() === 10 ? 'routed' : 'routing' }}</span>
        </div>

        <div class="cue" [style.opacity]="cueO()" aria-hidden="true">
          <span class="tag">Scroll</span><i></i>
        </div>
      </div>
    </section>

    <ax-ticker [items]="marquee" [duration]="48"/>

    <!-- ================= counts ================= -->
    <section class="nums">
      @for (n of numbers; track n.l) {
        <div class="num glass glass--live glass--spot lift sheen reveal" axSpot>
          <div class="num-v"><ax-count [value]="n.v" [suffix]="n.s"/></div>
          <div class="num-l">{{ n.l }}</div>
          <div class="num-d">{{ n.d }}</div>
        </div>
      }
    </section>

    <!-- ================= the line ================= -->
    <section id="line" class="sect wrap-w">
      <ax-waves [count]="6" [intensity]="0.5" [spread]="0.7"/>
      <div class="sect-body">
        <div class="sect-h reveal">
          <div class="tag">01 · The line</div>
          <h2 axScramble>Every stage feeds the next</h2>
          <p>An agent never starts from the raw requirement. It starts from the artifact
             the stage before it produced, after you approved that artifact.</p>
        </div>

        <div class="lane reveal">
          <img class="img lane-img" src="assets/brand/axiom-pipeline.svg" alt="" width="1600" height="420" loading="lazy">
        </div>

        <div class="cards">
          @for (c of cards; track c.h) {
            <article class="cell glass glass--live glass--spot lift sheen tilt reveal" axSpot axTilt="5">
              <div class="cell-k tag">{{ c.k }}</div>
              <h3 axScramble>{{ c.h }}</h3>
              <p>{{ c.b }}</p>
            </article>
          }
        </div>
      </div>
    </section>

    <!-- ================= what it produces ================= -->
    <section id="output" class="sect">
      <div class="sect-h reveal">
        <div class="tag">02 · What it produces</div>
        <h2 axScramble>Ten documents, not ten opinions</h2>
        <p>Every run leaves a complete engineering record on disk. These are the
           artifacts from a single requirement — each one the input to the next.</p>
      </div>

      <div class="arts">
        @for (a of artifacts; track a.k) {
          <article class="art glass glass--live glass--spot lift reveal" axSpot
                   [style.--c]="a.c">
            <div class="art-t">
              <span class="art-k mono">{{ a.k }}</span>
              <span class="art-n">{{ a.n }}</span>
            </div>
            <p class="art-d">{{ a.d }}</p>
            <div class="art-f mono">{{ a.f }}</div>
          </article>
        }
      </div>
    </section>

    <!-- ================= requirement catalogue ================= -->
    <section id="catalogue" class="sect">
      <div class="sect-h reveal">
        <div class="tag">03 · Try it</div>
        <h2 axScramble>Six requirements, ready to run</h2>
        <p>Each brief is a real problem domain with its own actors, business rules,
           concurrency trap and vulnerability profile — so the ten agents produce
           genuinely different work for each.</p>
      </div>

      <div class="rqs">
        @for (b of catalog; track b.id) {
          <article class="rq glass glass--spot lift sheen reveal" axSpot>
            <div class="rq-h">
              <h3>{{ b.title }}</h3>
              <span class="tag mono">{{ b.domain }}</span>
            </div>
            <p class="rq-s">{{ b.summary }}</p>
            <div class="rq-m">
              @for (m of b.metrics.slice(0, 3); track m.k) {
                <span class="rq-mi"><b class="mono">{{ m.v }}</b>{{ m.k }}</span>
              }
            </div>
            <div class="rq-f">
              <span class="chip mono">{{ b.stories.length }} stories</span>
              <span class="chip mono">{{ b.rules.length }} rules</span>
              <span class="chip mono">{{ b.vulns.length }} findings</span>
              <span class="chip mono">{{ b.stackList[0] }}</span>
            </div>
          </article>
        }
      </div>
    </section>

    <!-- ================= how it runs ================= -->
    <section id="how" class="sect">
      <div class="sect-h reveal">
        <div class="tag">04 · How it runs</div>
        <h2 axScramble>Gates, not a conveyor</h2>
      </div>

      <div class="gates">
        @for (g of gates; track g.k; let i = $index) {
          <article class="gate glass glass--spot lift reveal" axSpot
                   [style.transition-delay]="(i * 60) + 'ms'">
            <div class="g-n mono">{{ pad(i + 1) }}</div>
            <div class="g-b">
              <h3>{{ g.k }}</h3>
              <p>{{ g.b }}</p>
            </div>
            <i class="g-dot dot" [style.--c]="g.c"></i>
          </article>
        }
      </div>
    </section>

    <!-- ================= close ================= -->
    <section class="close reveal">
      <ax-waves [count]="7" [intensity]="0.7" [spread]="0.8"/>
      <div class="close-in">
        <h2 axScramble>Open a console</h2>
        <p>Your account maps to a private SQLite file and workspace tree on this
           machine. Nothing is shared between handles, and nothing leaves the disk.</p>
        <button class="btn btn--plasma magnet" axMagnet="8" (click)="jumpToDoor('up')">Create an account</button>
      </div>
    </section>

    <footer class="foot">
      <span class="tag">AXIOM</span>
      <span class="tag">Development Software Factory</span>
      <span class="tag">v2</span>
    </footer>
  </div>
  `,
  styles: [`
    .enter { position:relative; z-index:1; }

    .bar {
      position:sticky; top:0; z-index:20;
      display:flex; align-items:center; justify-content:space-between;
      height:var(--top); padding:0 var(--gut);
      backdrop-filter:blur(14px);
      border-bottom:1px solid var(--edge);
    }
    .logo { display:flex; align-items:center; gap:9px; font-family:var(--f-display); letter-spacing:.14em; font-size:14px; }
    .glyph { width:21px; height:21px; }
    .bar-n { display:flex; align-items:center; gap:14px; }
    .bl { font-size:13.5px; color:var(--ink-3); padding-bottom:2px;
          transition:color var(--t-hov) var(--ease); }
    .bl:hover { color:var(--ink); }
    @media (max-width:760px){ .bl { display:none; } }

    /* ---------- scroll stage ---------- */
    .stage { position:relative; height:var(--stage-h, 340vh); }
    .stick { position:sticky; top:0; height:100dvh; overflow:hidden;
             display:flex; align-items:center; }

    .stage-in { position:relative; z-index:2; width:100%;
                max-width:var(--max); margin:0 auto; padding:0 var(--gut);
                display:grid; }

    /* Copy and card occupy the same grid cell, so the handoff happens in place
       rather than the page jumping when one replaces the other. Both are held
       to the left column; the trace's region reserves the rest. */
    .copy, .doorw { grid-area:1 / 1; align-self:center; }
    .copy { max-width:52ch; will-change:transform, opacity; }
    .sub { margin-top:20px; font-size:clamp(1rem,1.5vw,1.12rem); color:var(--ink-2);
           max-width:48ch; line-height:1.62; }
    h1 .grad { background:var(--plasma); -webkit-background-clip:text; background-clip:text;
               -webkit-text-fill-color:transparent; }

    .doorw { visibility:hidden; will-change:transform, opacity; width:min(452px, 100%); }
    .doorw.on { visibility:visible; }

    /* ---------- account card ---------- */
    .auth { padding:26px 26px 22px; display:flex; flex-direction:column; gap:16px;
            box-shadow:0 24px 70px -30px rgba(0,0,0,.9); }
    .au-t { font-size:1.42rem; }
    .au-s { margin-top:7px; font-size:12.8px; color:var(--ink-3); line-height:1.55; }

    .tabs { position:relative; display:grid; grid-template-columns:1fr 1fr; gap:0;
            background:var(--sink); border-radius:var(--r-1); padding:3px; }
    .tab { padding:9px 10px; font-size:13px; font-weight:600; color:var(--ink-3);
           border-radius:5px; position:relative; z-index:1;
           transition:color var(--t-hov) var(--ease); }
    .tab.on { color:var(--ink); }
    .tab:hover { color:var(--ink-2); }
    .tab-ink { position:absolute; z-index:0; top:3px; bottom:3px; left:3px;
               width:calc(50% - 3px); border-radius:5px; background:var(--raise-3);
               transition:transform .26s var(--ease); }

    .au-f { display:flex; flex-direction:column; gap:13px; }
    .fl { display:flex; flex-direction:column; gap:6px; }
    .fl-k { display:flex; align-items:baseline; justify-content:space-between;
            font-size:12px; font-weight:600; color:var(--ink-2); letter-spacing:.01em; }
    .fl-a { font-size:11.5px; color:var(--plasma-b); }
    .fl-a:hover { text-decoration:underline; }
    .field { font-size:14px; height:44px; }
    .field.bad { border-color:var(--bad); box-shadow:0 0 0 3px rgba(251,113,133,.14); }

    .fw { position:relative; display:block; }
    .fw .field { width:100%; padding-right:62px; }
    .eye { position:absolute; right:6px; top:50%; transform:translateY(-50%);
           font-size:11.5px; font-weight:600; color:var(--ink-3); padding:6px 8px;
           border-radius:4px; transition:color var(--t-hov) var(--ease), background var(--t-hov) var(--ease); }
    .eye:hover { color:var(--ink); background:var(--raise-2); }

    .pw { display:flex; align-items:center; gap:9px; margin-top:2px; }
    .pw-b { display:flex; gap:3px; flex:1; }
    .pw-b i { flex:1; height:3px; border-radius:2px; background:var(--raise-2);
              transition:background .25s var(--ease); }
    .pw-b i.on { background:var(--c); }
    .pw-l { font-size:11px; font-weight:600; }

    .ck { display:flex; align-items:flex-start; gap:9px; font-size:12.5px; color:var(--ink-3);
          line-height:1.5; cursor:pointer; }
    .ck input { width:15px; height:15px; margin-top:1px; accent-color:var(--plasma-solid); flex:none; }

    .au-e { padding:10px 12px; border-radius:var(--r-1); font-size:12.5px; line-height:1.5;
            background:rgba(251,113,133,.1); color:var(--bad);
            border:1px solid rgba(251,113,133,.25); }
    .au-go { height:46px; font-size:14px; margin-top:2px; }

    .au-or { display:flex; align-items:center; gap:12px; color:var(--ink-4); font-size:11px; }
    .au-or::before, .au-or::after { content:''; height:1px; flex:1; background:var(--edge); }

    .au-sso { display:flex; flex-direction:column; gap:8px; }
    .sso { display:flex; align-items:center; justify-content:center; gap:10px;
           height:44px; width:100%; border-radius:var(--r-1); font-size:13.5px; font-weight:600;
           color:var(--ink-2); box-shadow:inset 0 0 0 1px var(--edge-2);
           transition:background var(--t-hov) var(--ease); }
    .sso:not(:disabled):hover { background:var(--raise); }
    .sso:disabled { opacity:.45; cursor:not-allowed; }
    .sso-g { width:17px; height:17px; }
    .sso-n { font-size:11px; color:var(--ink-4); line-height:1.5; }

    .au-f2 { font-size:12.5px; color:var(--ink-3); text-align:center; }
    .lk { font-size:12.5px; font-weight:600; color:var(--plasma-b); }
    .lk:hover { text-decoration:underline; }

    /* readout */
    .hud { position:absolute; z-index:2; right:var(--gut); bottom:clamp(22px,4vh,44px);
           display:flex; align-items:baseline; gap:4px; }
    .hud-n { font-size:clamp(1.8rem,3.6vw,2.6rem); font-weight:600; letter-spacing:-.05em;
             color:var(--ink); }
    .hud-d { font-size:1.05rem; color:var(--ink-4); }
    .hud-l { margin-left:11px; font-size:10.5px; letter-spacing:.2em; text-transform:uppercase;
             color:var(--ink-3); align-self:center; }
    @media (max-width:900px){ .hud { display:none; } }

    /* scroll cue */
    .cue { position:absolute; z-index:2; left:50%; transform:translateX(-50%);
           bottom:clamp(18px,3vh,34px); display:flex; flex-direction:column;
           align-items:center; gap:7px; transition:opacity .3s var(--ease); }
    .cue i { width:1px; height:26px; background:linear-gradient(var(--plasma-a), transparent); }

    @media (max-width:980px){
      .stage { --stage-h:320vh; }
      .copy, .doorw { max-width:none; width:100%; }
      .stage-in { padding:0 var(--gut); }
      .auth { padding:22px 20px 18px; }
    }

    /* Reduced motion collapses the stage to one screen: the scene paints its
       finished frame, and copy and card are both simply present. */
    @media (prefers-reduced-motion: reduce) {
      .stage { --stage-h:auto; }
      .stick { position:static; height:auto; padding:clamp(48px,8vw,96px) 0; }
      .stage-in { display:block; }
      .copy, .doorw { opacity:1 !important; transform:none !important;
                      visibility:visible !important; max-width:none; }
      .doorw { margin-top:34px; width:min(452px,100%); }
      .cue, .hud { display:none; }
    }

    /* numbers */
    .nums {
      display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
      max-width:var(--max); margin:0 auto; padding:clamp(34px,5vw,58px) var(--gut) 0;
    }
    .num { padding:21px 20px; }
    .num-v { font-family:var(--f-display); font-size:2.35rem; font-weight:700; letter-spacing:-.045em; }
    .num-l { font-size:14px; color:var(--ink); margin-top:6px; }
    .num-d { font-size:12.5px; color:var(--ink-4); margin-top:5px; line-height:1.55; }

    /* sections */
    .sect { position:relative; max-width:var(--max); margin:0 auto;
            padding:clamp(56px,8vw,104px) var(--gut) 0; }
    .wrap-w { isolation:isolate; }
    .sect-body { position:relative; z-index:1; }
    .sect-h { max-width:58ch; margin-bottom:26px; }
    .sect-h h2 { margin-top:9px; }
    .sect-h p { margin-top:12px; font-size:14.5px; color:var(--ink-3); line-height:1.65; }

    .lane { margin-bottom:14px; border-radius:var(--r-2); overflow:hidden; border:1px solid var(--edge); }
    .lane-img { width:100%; outline:none; }

    .cards { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(268px,1fr)); }
    .cell { padding:22px 20px; }
    .cell-k { margin-bottom:9px; }
    .cell h3 { margin-bottom:7px; font-size:1.06rem; }
    .cell p { font-size:13.5px; color:var(--ink-3); line-height:1.62; }

    /* gates */
    .gates { display:grid; gap:8px; }
    .gate { display:flex; align-items:flex-start; gap:16px; padding:17px 19px; }
    .g-n { font-size:12px; color:var(--plasma-a); padding-top:2px; flex:none; letter-spacing:.1em; }
    .g-b { flex:1; }
    .g-b h3 { font-size:1.02rem; }
    .g-b p { font-size:13.5px; color:var(--ink-3); margin-top:5px; line-height:1.6; }
    .g-dot { margin-top:7px; }

    /* close */
    /* ---------- artifacts + catalogue ---------- */
    .arts { display:grid; gap:8px; grid-template-columns:repeat(auto-fill,minmax(215px,1fr)); }
    .art { padding:15px 16px; display:flex; flex-direction:column; gap:8px; min-height:158px;
           border-top:2px solid var(--c); }
    .art-t { display:flex; align-items:baseline; gap:9px; }
    .art-k { font-size:11px; letter-spacing:.14em; color:var(--c); }
    .art-n { font-size:13.5px; color:var(--ink); font-weight:600; }
    .art-d { font-size:12px; color:var(--ink-3); line-height:1.55; flex:1; }
    .art-f { font-size:10px; color:var(--ink-4); padding-top:9px; border-top:1px solid var(--edge);
             overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .rqs { display:grid; gap:10px; grid-template-columns:repeat(auto-fill,minmax(316px,1fr)); }
    .bl { padding:19px 20px; display:flex; flex-direction:column; gap:10px; }
    .rq-h { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .rq-h h3 { font-size:1.02rem; }
    .rq-s { font-size:12.5px; color:var(--ink-3); line-height:1.6; }
    .rq-m { display:flex; flex-wrap:wrap; gap:15px; padding:11px 0; border-top:1px solid var(--edge);
            border-bottom:1px solid var(--edge); }
    .rq-mi { display:flex; flex-direction:column; gap:2px; font-size:10.5px; color:var(--ink-4); }
    .rq-mi b { font-size:14px; color:var(--ink); font-weight:600; }
    .rq-f { display:flex; flex-wrap:wrap; gap:4px; }
    .rq-f .chip { font-size:10px; padding:3px 8px; border-radius:3px;
                  background:var(--raise-2); color:var(--ink-3); }

    .close { position:relative; isolation:isolate; overflow:hidden;
             max-width:var(--max); margin:clamp(56px,8vw,104px) auto 0;
             border-radius:var(--r-3); border:1px solid var(--edge);
             padding:clamp(44px,7vw,88px) var(--gut); text-align:center; }
    .close-in { position:relative; z-index:1; max-width:52ch; margin:0 auto;
                display:flex; flex-direction:column; align-items:center; gap:14px; }
    .close-in p { font-size:14px; color:var(--ink-2); line-height:1.65; }

    .foot { display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap;
            max-width:var(--max); margin:clamp(48px,6vw,80px) auto 0;
            padding:18px var(--gut); border-top:1px solid var(--edge); }
  `],
})
export class EnterPage implements AfterViewInit, OnDestroy {
  private session = inject(Session);
  private auth = inject(Auth);
  private toast = inject(Toaster);
  @ViewChild('stage') stageEl?: ElementRef<HTMLElement>;
  @ViewChild('authCard') cardEl?: ElementRef<HTMLElement>;

  // ------------------------------------------------------------------- form
  readonly mode = signal<Mode>('in');
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly err = signal<AuthError | null>(null);
  f = { name: '', email: '', password: '', confirm: '', terms: false, remember: true };

  // A method, not a computed: `f` is a plain object mutated by ngModel, and
  // computed() only re-runs when a signal it read changes — so a computed here
  // latches on its first value and the meter never moves. Template methods are
  // re-evaluated every change-detection pass, which is what this needs.
  strength() { return Auth.strength(this.f.password); }
  strengthLabel() { return ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][this.strength()]; }
  strengthColor() {
    return ['var(--bad)', 'var(--bad)', 'var(--run)', 'var(--plasma-b)', 'var(--ok)'][this.strength()];
  }

  setMode(m: Mode) { this.mode.set(m); this.err.set(null); }

  async submit() {
    if (this.busy()) return;
    this.err.set(null);
    const { name, email, password, confirm, terms } = this.f;

    if (this.mode() === 'up') {
      if (password !== confirm) {
        this.err.set(new AuthError('The two passwords do not match.', 'confirm'));
        return;
      }
      if (!terms) {
        this.err.set(new AuthError('Please confirm you understand the account is device-local.'));
        return;
      }
    }

    this.busy.set(true);
    try {
      const op = this.mode() === 'up'
        ? await this.auth.signUp(name, email, password)
        : await this.auth.signIn(email, password);
      // Nothing about the password survives this scope.
      this.f = { name: '', email: '', password: '', confirm: '', terms: false, remember: true };
      this.toast.ok(`Signed in as ${op.name}`, `handle · ${op.handle}`);
    } catch (e) {
      this.err.set(e instanceof AuthError ? e : new AuthError('Something went wrong. Try again.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * A device-local account has no recovery channel — there is no server to
   * mail a reset link. Say so plainly rather than pretending to send one.
   */
  forgot() {
    const e = this.f.email.trim();
    if (e && this.auth.has(e)) {
      this.toast.info('No password reset on a device-local account',
                      'Remove it from the sign-in list and create it again.');
    } else {
      this.toast.info('Accounts live only on this device',
                      'There is no server to send a reset link from.');
    }
  }

  // ----------------------------------------------------------------- scroll
  readonly prog = signal(0);
  readonly lit = signal(0);
  readonly wide = signal(typeof innerWidth === 'number' ? innerWidth >= 980 : true);

  /**
   * The trace never enters the column the copy and the card occupy. Wide
   * screens give it the right half; narrow ones give it the band below.
   */
  readonly region = computed<Region>(() => this.wide()
    ? { l: 0.50, t: 0.05, r: 0.99, b: 0.95 }
    : { l: 0.02, t: 0.60, r: 0.98, b: 0.99 });

  private readonly reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private static band(p: number, a: number, b: number) {
    return Math.max(0, Math.min(1, (p - a) / (b - a)));
  }
  readonly copyO = computed(() => 1 - EnterPage.band(this.prog(), 0.56, 0.72));
  readonly copyY = computed(() => -this.prog() * 46);
  private readonly doorK = computed(() => EnterPage.band(this.prog(), 0.70, 0.88));
  readonly doorO = computed(() => this.doorK());
  readonly doorY = computed(() => (1 - this.doorK()) * 26);
  readonly doorOn = computed(() => this.doorK() > 0.02);
  readonly cueO = computed(() => 1 - EnterPage.band(this.prog(), 0, 0.1));

  ngAfterViewInit() {
    if (this.reduced) { this.prog.set(1); this.lit.set(10); return; }
    addEventListener('scroll', this.onScroll, { passive: true });
    addEventListener('resize', this.onResize, { passive: true });
    this.onScroll();
  }
  ngOnDestroy() {
    removeEventListener('scroll', this.onScroll);
    removeEventListener('resize', this.onResize);
  }

  /**
   * Deliberately synchronous. A rAF-throttled handler with a `ticking` flag
   * only clears that flag inside the rAF callback, and rAF does not run in a
   * background tab or a prerender — so the flag latches and scroll progress
   * freezes for good. One rect read per event is cheaper than that bug.
   */
  private onScroll = () => {
    const el = this.stageEl?.nativeElement;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const span = el.offsetHeight - innerHeight;
    const p = span > 8 ? -r.top / span : (r.top <= 0 ? 1 : 0);
    this.prog.set(Math.max(0, Math.min(1, p)));
  };

  private onResize = () => { this.wide.set(innerWidth >= 980); this.onScroll(); };

  /** Drives the stage to its end, where the card lives, then focuses it. */
  jumpToDoor(m: Mode) {
    this.setMode(m);
    const el = this.stageEl?.nativeElement;
    if (el && !this.reduced) {
      scrollTo({ top: el.offsetTop + Math.max(0, el.offsetHeight - innerHeight), behavior: 'smooth' });
    } else {
      this.cardEl?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
      const first = this.cardEl?.nativeElement.querySelector<HTMLInputElement>('input:not([type=checkbox])');
      first?.focus();
    }, this.reduced ? 300 : 750);
  }

  // ------------------------------------------------------------------ copy
  private mock = inject(MockApi);
  readonly catalog = this.mock.catalog;

  readonly artifacts = [
    { k: 'REQ',  n: 'Requirement', c: '#8B5CF6', f: 'output_refined_requirement.md',
      d: 'Scope in and out, actors, business rules, and the questions the brief never answered.' },
    { k: 'HLS',  n: 'Solution', c: '#8B5CF6', f: 'output_high_level_solution.md',
      d: 'Stack chosen with reasons, architecture decisions as ADRs, and a risk register.' },
    { k: 'HLD',  n: 'Design', c: '#7C6CF0', f: 'output_high_level_design.md',
      d: 'Containers, sequence diagrams, the data model and every integration seam.' },
    { k: 'US',   n: 'Stories', c: '#6E7CEA', f: 'output_user_stories.md',
      d: 'INVEST stories with Given/When/Then criteria and the edge cases that break them.' },
    { k: 'TR',   n: 'Test review', c: '#5F8CE4', f: 'output_test_review.md',
      d: 'Gherkin features written before any code exists, prioritised P0 to P2.' },
    { k: 'LLD',  n: 'Low-level', c: '#519BDE', f: 'output_low_level_design.md',
      d: 'Package layout, class signatures, the schema, and the error model.' },
    { k: 'TDD',  n: 'Strategy', c: '#43ABD8', f: 'output_tdd_test_strategy.md',
      d: 'Compilable test classes matching the scenarios, with coverage targets per package.' },
    { k: 'CODE', n: 'Build', c: '#35BAD2', f: 'output_implemented_code.md',
      d: 'Every source file, building clean, with the invariant enforced where it belongs.' },
    { k: 'SCA',  n: 'Analysis', c: '#2BC7DB', f: 'output_static_analysis.md',
      d: 'Complexity, duplication and the findings that are defects rather than smells.' },
    { k: 'SEC',  n: 'Security', c: '#22D3EE', f: 'output_security_analysis.md',
      d: 'Vulnerabilities mapped to CWE and OWASP with CVSS scores and remediation.' },
  ];

  readonly marquee = [
    'Requirement in, engineering record out',
    'Ten specialist agents',
    'Approve · rework · reject',
    'Runs locally on the Claude Code CLI',
    'Per-operator database isolation',
    'Azure DevOps wiki and work items',
    'Markdown artifacts on your disk',
  ];

  readonly numbers = [
    { v: 10, s: '',  l: 'Specialist agents',  d: 'Requirement through security audit, each with one job.' },
    { v: 10, s: '',  l: 'Approval gates',     d: 'Nothing advances until you have read it and said yes.' },
    { v: 2,  s: '',  l: 'Pipeline modes',     d: 'Per story, or the whole requirement end to end.' },
    { v: 0,  s: '',  l: 'Bytes off the disk', d: 'Requirements and generated code stay on this machine.' },
  ];

  readonly cards = [
    { k: 'Isolation', h: 'Your own database',
      b: 'Each account routes to a separate SQLite file and workspace tree. Nothing is shared between handles on the same install.' },
    { k: 'Control',   h: 'Ten gates, not ten steps',
      b: 'An artifact only becomes the next agent’s input after you approve it. Reject halts the line; rework re-runs with your notes.' },
    { k: 'Locality',  h: 'Runs on this machine',
      b: 'The Claude Code CLI executes as a child process. Requirements and generated code never leave the filesystem.' },
    { k: 'Provenance', h: 'See what each agent added',
      b: 'Any stage can be diffed against the artifact it consumed, so "what did this one actually contribute" is answerable without reading 20 KB.' },
  ];

  readonly gates = [
    { k: 'Submit a requirement', c: 'var(--idle)',
      b: 'Paste the requirement into a workspace and choose per-story or full-sequence.' },
    { k: 'The agent runs', c: 'var(--run)',
      b: 'The stage is dispatched to a background thread and the CLI runs headless. The interface stays live throughout.' },
    { k: 'It lands in review', c: 'var(--review)',
      b: 'The output is written to disk as markdown and the stage moves to IN_REVIEW. Nothing advances on its own.' },
    { k: 'You decide', c: 'var(--ok)',
      b: 'Approve and the next agent picks it up. Rework re-runs this stage with your notes appended. Reject stops the line here.' },
  ];

  pad(n: number) { return String(n).padStart(2, '0'); }
}
