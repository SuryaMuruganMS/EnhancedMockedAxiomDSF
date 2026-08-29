import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, interval, startWith, switchMap, takeUntil, catchError, of } from 'rxjs';
import { WorkflowService, Workflow } from '../services/workflow.service';
import {
  SpotDirective, RevealDirective, TiltDirective, MagnetDirective,
  ScrambleDirective, ParallaxDirective,
} from '../core/ui';
import { Ring, Bars, Ticker, Flow, FlowStage } from '../core/widgets';
import { TraceHero } from '../core/trace-hero';

interface Agent {
  n: number; k: string; a: string; t: string;
  role: string;
  inFile: string; outFile: string;
  mandatory: boolean;
  produces: string[];
}

/**
 * The line, explained.
 *
 * The console answers "where is my run"; this answers "what are these ten
 * things and what does each one hand the next". It is the one surface in the
 * app that is allowed to be a piece of design rather than an instrument — so
 * the brand key visual is the plate behind the hero, and the cards carry the
 * decorative hover work that would be noise on the console.
 */
@Component({
  selector: 'ax-agents',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    SpotDirective, RevealDirective, TiltDirective, MagnetDirective,
    ScrambleDirective, ParallaxDirective,
    Ring, Bars, Ticker, Flow, TraceHero,
  ],
  template: `
  <div class="pg" axReveal>

    <!-- ---------- hero, on the key visual ---------- -->
    <section class="hero plate">
      @if (wide()) { <ax-trace [progress]="1" [region]="HERO_REGION"/> }
      <div class="plate-scrim"></div>

      <div class="hero-in">
        <div class="tag">The line</div>
        <h2 axScramble>Ten agents, ten gates</h2>
        <p class="lede">
          One requirement enters at REQ and leaves at SEC as a reviewed engineering record.
          Each agent consumes the artifact the one before it produced — nothing advances
          until you approve what is on the table.
        </p>

        <div class="hero-a">
          <a routerLink="/run" class="btn btn--plasma magnet" axMagnet="7">Start a run</a>
          <a routerLink="/console" class="btn btn--quiet press">Open console</a>
        </div>
      </div>

      <div class="hero-ring glass" axSpot>
        <ax-ring [value]="done()" [total]="10" [size]="88"/>
        <div class="hr-l">
          <div class="tag">Approved</div>
          <div class="hr-s mono">{{ done() ? 'line advancing' : 'line idle' }}</div>
        </div>
      </div>
    </section>

    <!-- ---------- live flow strip ---------- -->
    <section class="strip glass glass--spot" axSpot>
      <div class="s-top">
        <div class="tag">Live line</div>
        <div class="tag mono">{{ live() ? 'RUNNING' : 'IDLE' }}</div>
      </div>
      <ax-flow [stages]="flowStages()" [live]="live()" [selected]="focus()" (pick)="focus.set($event)"/>
    </section>

    <ax-ticker [items]="facts" [duration]="46"/>

    <!-- ---------- the ten ---------- -->
    <section class="wall">
      @for (a of agents; track a.n) {
        <article class="ac glass glass--live glass--spot lift sheen tilt reveal"
                 axSpot axTilt="5"
                 [class.focus]="focus() === a.n"
                 (pointerenter)="focus.set(a.n)"
                 tabindex="0" (focus)="focus.set(a.n)">

          <div class="ac-top">
            <span class="ac-n mono">{{ pad(a.n) }}</span>
            <span class="ac-k mono">{{ a.k }}</span>
            <i class="dot" [style.--c]="colorOf(stateOf(a.a))"
               [class.dot--beat]="isLive(stateOf(a.a))"></i>
          </div>

          <h3 axScramble>{{ a.t }}</h3>
          <p class="ac-r">{{ a.role }}</p>

          <ul class="ac-p">
            @for (p of a.produces; track p) { <li>{{ p }}</li> }
          </ul>

          <div class="ac-io mono">
            <span class="io-i">{{ a.inFile }}</span>
            <span class="io-x">→</span>
            <span class="io-o">{{ a.outFile }}</span>
          </div>

          <div class="ac-foot">
            <span class="tag" [class.req]="a.mandatory">{{ a.mandatory ? 'Mandatory' : 'Optional' }}</span>
            <span class="tag mono ac-st" [style.color]="colorOf(stateOf(a.a))">
              {{ stateOf(a.a).replace('_', ' ') }}
            </span>
          </div>
        </article>
      }
    </section>

    <!-- ---------- throughput ---------- -->
    <section class="tail">
      <div class="glass p lift" axSpot>
        <div class="tag">Stage completion</div>
        <div class="p-b">
          <ax-bars [data]="perStage()" [colors]="perStageColors()" [labels]="stageKeys" [height]="54"/>
        </div>
        <div class="p-x mono">
          @for (k of stageKeys; track k) { <span>{{ k }}</span> }
        </div>
      </div>

      <div class="glass p lift plate plate--even" axSpot>
        <img class="plate-img" src="assets/brand/axiom-texture-1600.webp" alt=""
             width="1600" height="904" loading="lazy" decoding="async">
        <div class="plate-scrim"></div>
        <div class="tag">Mode</div>
        <h3 class="p-h">Per story, or the whole sequence</h3>
        <p class="p-t">
          <b>Per story</b> runs REQ→US once, then gives every user story its own
          TR→SEC pipeline you can drive independently.
          <b>Full sequence</b> takes one requirement straight through all ten.
        </p>
        <a routerLink="/run" class="btn btn--plasma press">Choose a mode</a>
      </div>
    </section>
  </div>
  `,
  styles: [`
    .pg { position:relative; z-index:1; display:flex; flex-direction:column; gap:12px; }

    /* hero */
    .hero { border-radius:var(--r-3); border:1px solid var(--edge); --plate-o:.62;
            isolation:isolate;
            padding:clamp(28px,5vw,64px); min-height:clamp(320px,42vw,440px);
            display:flex; flex-direction:column; justify-content:center; }
    .hero ax-trace { border-radius:inherit; overflow:hidden; }
    .hero .plate-scrim { z-index:1; }
    .hero-in, .hero-ring { position:relative; z-index:2; }
    .hero-in { max-width:56ch; }
    .hero h2 { margin-top:9px; font-size:clamp(1.9rem,4.2vw,3rem); }
    .lede { margin-top:14px; font-size:clamp(.94rem,1.4vw,1.05rem); color:var(--ink-2); max-width:54ch; }
    .hero-a { display:flex; gap:9px; margin-top:24px; flex-wrap:wrap; }

    .hero-ring { position:absolute; right:clamp(16px,3vw,40px); bottom:clamp(16px,3vw,40px);
                 display:flex; align-items:center; gap:14px; padding:14px 18px 14px 14px; }
    .hr-l { display:flex; flex-direction:column; gap:3px; }
    .hr-s { font-size:11.5px; color:var(--ink-3); letter-spacing:.06em; }
    @media (max-width:820px){ .hero-ring { position:static; margin-top:24px; align-self:flex-start; } }

    /* live strip */
    .strip { padding:15px 18px 12px; }
    .s-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }

    /* the ten */
    .wall { display:grid; gap:10px; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); }
    .ac { padding:16px 17px 13px; display:flex; flex-direction:column; gap:9px; min-height:250px; }
    .ac.focus { border-color:var(--edge-live); }
    .ac-top { display:flex; align-items:center; gap:9px; }
    .ac-n { font-size:11px; color:var(--ink-4); }
    .ac-k { font-size:11.5px; font-weight:600; color:var(--plasma-b); letter-spacing:.14em; flex:1; }
    .ac h3 { font-size:1.12rem; }
    .ac-r { font-size:13.5px; color:var(--ink-3); line-height:1.62; }

    .ac-p { list-style:none; display:flex; flex-wrap:wrap; gap:4px; margin-top:auto; }
    .ac-p li { font-family:var(--f-mono); font-size:11px; letter-spacing:.02em;
               padding:4px 8px; border-radius:3px; background:var(--raise-2); color:var(--ink-3); }

    .ac-io { display:flex; align-items:center; gap:7px; font-size:10.5px; color:var(--ink-4);
             padding-top:10px; border-top:1px solid var(--edge); }
    .io-i, .io-o { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
    .io-o { color:var(--ink-3); text-align:right; }
    .io-x { color:var(--plasma-a); flex:none; }

    .ac-foot { display:flex; align-items:center; justify-content:space-between; }
    .ac-foot .req { color:var(--ink-2); }
    .ac-st { font-size:10.5px; }

    /* tail */
    .tail { display:grid; gap:10px; grid-template-columns:1.15fr .85fr; }
    @media (max-width:900px){ .tail { grid-template-columns:1fr; } }
    .p { padding:17px 18px; border-radius:var(--r-2); }
    .p-b { margin-top:14px; }
    .p-x { display:flex; justify-content:space-between; margin-top:8px; font-size:10px; color:var(--ink-4); }
    .p--even { --plate-o:.30; }
    .plate--even { --plate-o:.30; }
    .p-h { margin:10px 0 8px; }
    .p-t { font-size:13.5px; color:var(--ink-3); line-height:1.65; margin-bottom:16px; }
    .p-t b { color:var(--ink-2); font-weight:600; }
  `],
})
export class AgentsPage implements OnInit, OnDestroy {
  private wf = inject(WorkflowService);
  private stop$ = new Subject<void>();

  flows = signal<Workflow[]>([]);
  focus = signal(0);

  /** The hero copy owns the left column; the route gets what is left of it. */
  readonly HERO_REGION = { l: 0.54, t: 0.08, r: 0.98, b: 0.92 };
  /** Below this the hero is too short for a route that does not collide with text. */
  readonly wide = signal(typeof innerWidth === 'number' ? innerWidth >= 1024 : true);
  private onResize = () => this.wide.set(innerWidth >= 1024);

  readonly agents: Agent[] = [
    { n: 1, k: 'REQ', a: 'RequirementAnalysisRefinementAgent', t: 'Requirement', mandatory: true,
      role: 'Turns raw requirement text into a scoped package: what is in, what is out, what is still unknown.',
      inFile: 'input_raw_requirement.md', outFile: 'output_refined_requirement.md',
      produces: ['Scope', 'Constraints', 'Open questions', 'Acceptance criteria'] },
    { n: 2, k: 'HLS', a: 'HLSAgent', t: 'Solution', mandatory: true,
      role: 'Chooses the architecture and the stack, and says why — plus what could go wrong with each.',
      inFile: 'input_refined_requirement.md', outFile: 'output_high_level_solution.md',
      produces: ['Tech stack', 'Components', 'NFRs', 'Risks', 'Deployment'] },
    { n: 3, k: 'HLD', a: 'HLDAgent', t: 'Design', mandatory: true,
      role: 'Decomposes the solution into containers and the traffic between them. Diagrams are mandatory here.',
      inFile: 'input_hls_solution.md', outFile: 'output_high_level_design.md',
      produces: ['Containers', 'Interactions', 'Integration points', 'Mermaid diagrams'] },
    { n: 4, k: 'US', a: 'UserStoryAgent', t: 'Stories', mandatory: true,
      role: 'Cuts the design into INVEST stories, each one independently testable and separately shippable.',
      inFile: 'input_hld_blueprint.md', outFile: 'output_user_stories.md',
      produces: ['US-*.md files', 'Given/When/Then', 'Edge cases', 'Dependencies'] },
    { n: 5, k: 'TR', a: 'TRReviewAgent', t: 'Test review', mandatory: false,
      role: 'Writes the scenarios before anyone writes code — Gherkin features, prioritised P0 to P2.',
      inFile: 'input_user_stories.md', outFile: 'output_test_review.md',
      produces: ['BDD features', 'Coverage plan', 'Priority tags'] },
    { n: 6, k: 'LLD', a: 'LLDAgent', t: 'Low-level', mandatory: true,
      role: 'Specifies the actual classes: signatures, data models, error strategy, sequence flows.',
      inFile: 'input_trreview_and_hld.md', outFile: 'output_low_level_design.md',
      produces: ['Packages', 'Signatures', 'Data models', 'Sequences'] },
    { n: 7, k: 'TDD', a: 'TDDAgent', t: 'Strategy', mandatory: false,
      role: 'Converts the scenarios into test code that compiles and runs — a real suite, not a sketch.',
      inFile: 'input_lld_and_trreview.md', outFile: 'output_tdd_test_strategy.md',
      produces: ['Test files', 'Framework setup', 'Fixtures', 'P0 → P2 order'] },
    { n: 8, k: 'CODE', a: 'CodingAgent', t: 'Build', mandatory: true,
      role: 'Implements every file against the design and the tests. The output must build without a hand on it.',
      inFile: 'input_lld_and_tdd.md', outFile: 'output_implemented_code.md',
      produces: ['Source files', 'Build config', 'Entry points'] },
    { n: 9, k: 'SCA', a: 'StaticCodeAnalysisAgent', t: 'Analysis', mandatory: false,
      role: 'Reads what was built for smells, complexity, duplication, and the debt it would leave behind.',
      inFile: 'input_source_code.md', outFile: 'output_static_analysis.md',
      produces: ['Smells', 'Complexity', 'Debt', 'Ranked fixes'] },
    { n: 10, k: 'SEC', a: 'SecurityAgent', t: 'Security', mandatory: false,
      role: 'Audits the result against OWASP and CWE, scores what it finds, and says how to close each one.',
      inFile: 'input_security_code.md', outFile: 'output_security_analysis.md',
      produces: ['Vulnerabilities', 'CVSS', 'OWASP map', 'Remediation'] },
  ];

  readonly stageKeys = this.agents.map(a => a.k);

  readonly facts = [
    'Requirement in, engineering record out',
    'Ten gates — approve, rework, or reject',
    'Claude Code CLI runs locally',
    'Hexagonal core, ports and adapters',
    'Per-operator SQLite tenancy',
    'Azure DevOps wiki and work items',
    'Rework re-runs with your notes attached',
    'Artifacts are markdown on your disk',
  ];

  ngOnInit() {
    interval(5000).pipe(
      startWith(0),
      switchMap(() => this.wf.getAllWorkflows().pipe(catchError(() => of([])))),
      takeUntil(this.stop$),
    ).subscribe(w => this.flows.set(w ?? []));
    addEventListener('resize', this.onResize, { passive: true });
  }
  ngOnDestroy() {
    this.stop$.next(); this.stop$.complete();
    removeEventListener('resize', this.onResize);
  }

  /** Latest state per agent — rework re-runs an agent, so last write wins. */
  private states = computed(() => {
    const m: Record<string, string> = {};
    for (const w of this.flows()) if (w.agentName) m[w.agentName] = w.state;
    return m;
  });

  stateOf = (a: string) => this.states()[a] ?? 'PENDING';

  flowStages = computed<FlowStage[]>(() => this.agents.map(a => {
    const st = this.stateOf(a.a);
    return { k: a.k, state: st, color: this.colorOf(st), label: st.replace(/_/g, ' ') };
  }));

  done = computed(() => this.agents
    .filter(a => ['APPROVED', 'COMPLETED'].includes(this.stateOf(a.a))).length);

  live = computed(() => this.agents.some(a => this.isLive(this.stateOf(a.a))));

  /** One column per stage: 2 approved, 1 touched, 0 never run. */
  perStage = computed(() => this.agents.map(a => {
    const s = this.stateOf(a.a);
    if (s === 'APPROVED' || s === 'COMPLETED') return 2;
    return s === 'PENDING' ? 0 : 1;
  }));
  perStageColors = computed(() => this.agents.map(a => this.colorOf(this.stateOf(a.a))));

  isLive(s: string) { return s === 'IN_PROGRESS' || s === 'INIT'; }

  colorOf(s: string): string {
    switch (s) {
      case 'APPROVED': case 'COMPLETED': return 'var(--ok)';
      case 'IN_PROGRESS': case 'INIT':   return 'var(--run)';
      case 'IN_REVIEW':                  return 'var(--review)';
      case 'FAILED': case 'REJECTED':    return 'var(--bad)';
      default:                           return 'var(--idle)';
    }
  }
  pad(n: number) { return String(n).padStart(2, '0'); }
}
