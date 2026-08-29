import { Injectable, signal, computed } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { Brief, CATALOG, byId, Story } from './catalog';
import { renderAgent, Mode, STORY_SCOPED } from './render';

/* ===========================================================================
   The mock backend.
   ---------------------------------------------------------------------------
   Everything the real Spring service did, in memory: workspaces, workflow
   rows, agent output, approvals, health. No HTTP, no Claude CLI, no API key.

   Two decisions worth knowing about:

   1. State persists to localStorage. A prospect clicking around and then
      refreshing should not lose their run — and it means the demo can be left
      open on a stand for a day.

   2. A run advances on a timer rather than instantly. The whole product is
      about watching ten stages progress and approving between them; if every
      stage completed the moment it started there would be nothing to look at.
      Each stage takes a few seconds, which reads as "working" without making
      a viewer wait.
   =========================================================================== */

export const LINE = [
  { n: 1,  k: 'REQ',  a: 'RequirementAnalysisRefinementAgent', t: 'Requirement' },
  { n: 2,  k: 'HLS',  a: 'HLSAgent',                           t: 'Solution' },
  { n: 3,  k: 'HLD',  a: 'HLDAgent',                           t: 'Design' },
  { n: 4,  k: 'US',   a: 'UserStoryAgent',                     t: 'Stories' },
  { n: 5,  k: 'TR',   a: 'TRReviewAgent',                      t: 'Test review' },
  { n: 6,  k: 'LLD',  a: 'LLDAgent',                           t: 'Low-level' },
  { n: 7,  k: 'TDD',  a: 'TDDAgent',                           t: 'Strategy' },
  { n: 8,  k: 'CODE', a: 'CodingAgent',                        t: 'Build' },
  { n: 9,  k: 'SCA',  a: 'StaticCodeAnalysisAgent',            t: 'Analysis' },
  { n: 10, k: 'SEC',  a: 'SecurityAgent',                      t: 'Security' },
];

export interface MockWorkspace {
  id: number; projectName: string; description: string; techStack: string;
  pipelineMode: Mode; briefId: string; status: boolean;
  location: string; createdAt: string;
}
export interface MockWorkflow {
  id: number; workspaceId: number; requirementId: number;
  agentName: string; sequenceNumber: number; state: string;
  createdAt: string; updatedAt: string;
  comments?: string; storyId?: string;
}

interface Persisted { spaces: MockWorkspace[]; flows: MockWorkflow[]; seq: number; wsSeq: number; }

const KEY = 'axiom.mock.state';
const STAGE_MS = 3400;          // how long a stage "runs" before landing in review
const TICK_MS = 700;

@Injectable({ providedIn: 'root' })
export class MockApi {
  readonly spaces = signal<MockWorkspace[]>([]);
  readonly flows = signal<MockWorkflow[]>([]);
  private seq = 1;
  private wsSeq = 1;
  private started = Date.now();
  /** workflowId -> the instant it should finish running */
  private due = new Map<number, number>();

  constructor() {
    this.restore();
    setInterval(() => this.tick(), TICK_MS);
  }

  // --------------------------------------------------------------- catalogue
  readonly catalog = CATALOG;
  brief(id: string): Brief { return byId(id); }

  // ------------------------------------------------------------------ health
  health(): Observable<any> {
    const up = Math.floor((Date.now() - this.started) / 1000);
    const flows = this.flows();
    return of({
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: `0d ${Math.floor(up / 3600)}h ${Math.floor(up / 60) % 60}m ${up % 60}s`,
      uptimeMs: up * 1000,
      // A plausible heap that breathes, so the gauge is not a flat line.
      memory: {
        totalMB: 512, freeMB: 512 - this.heap(), usedMB: this.heap(), maxMB: 4072,
      },
      stats: {
        workspaces: this.spaces().length,
        totalWorkflows: flows.length,
        activeWorkflows: flows.filter(f => f.state === 'IN_PROGRESS').length,
        completedWorkflows: flows.filter(f => f.state === 'APPROVED').length,
        configuredAgents: 10,
      },
      jvm: { version: '17.0.12', vendor: 'Eclipse Adoptium', os: 'Linux amd64' },
    }).pipe(delay(40));
  }
  private heap() {
    const t = Date.now() / 1000;
    return Math.round(180 + Math.sin(t / 11) * 42 + Math.sin(t / 3.3) * 12 + this.flows().length * 2);
  }

  // -------------------------------------------------------------- workspaces
  listWorkspaces(): Observable<MockWorkspace[]> {
    return of([...this.spaces()]).pipe(delay(90));
  }
  getWorkspace(id: number): Observable<MockWorkspace> {
    const w = this.spaces().find(x => x.id === id);
    return w ? of(w).pipe(delay(70)) : throwError(() => ({ status: 404, error: { message: 'Workspace not found' } }));
  }
  createWorkspace(w: Partial<MockWorkspace>): Observable<MockWorkspace> {
    const brief = byId(w.briefId ?? CATALOG[0].id);
    const created: MockWorkspace = {
      id: this.wsSeq++,
      projectName: (w.projectName || brief.title).trim(),
      description: w.description || brief.summary,
      techStack: w.techStack || brief.stack,
      pipelineMode: (w.pipelineMode as Mode) || 'per-story',
      briefId: brief.id,
      status: true,
      location: `workspaces/workspace-${this.wsSeq - 1}_${slug(w.projectName || brief.title)}`,
      createdAt: new Date().toISOString(),
    };
    this.spaces.update(l => [...l, created]);
    this.save();
    return of(created).pipe(delay(220));
  }
  deleteWorkspace(id: number): Observable<any> {
    this.spaces.update(l => l.filter(w => w.id !== id));
    this.flows.update(l => l.filter(f => f.workspaceId !== id));
    this.save();
    return of({ deleted: id }).pipe(delay(150));
  }

  // ---------------------------------------------------------------- workflow
  allWorkflows(): Observable<MockWorkflow[]> {
    return of([...this.flows()]).pipe(delay(80));
  }

  /**
   * Start a run. Creates the REQ row IN_PROGRESS; the tick loop moves it to
   * IN_REVIEW when its time is up, and approving it starts the next stage.
   */
  startWorkflow(workspaceId: number, _text: string, mode?: Mode): Observable<MockWorkflow> {
    const ws = this.spaces().find(w => w.id === workspaceId);
    if (!ws) return throwError(() => ({ status: 404, error: { message: 'Workspace not found' } }));
    if (mode && mode !== ws.pipelineMode) {
      this.spaces.update(l => l.map(w => w.id === workspaceId ? { ...w, pipelineMode: mode } : w));
    }
    // Restarting clears the previous run for this workspace.
    this.flows.update(l => l.filter(f => f.workspaceId !== workspaceId));
    const row = this.newRow(workspaceId, 1);
    this.flows.update(l => [...l, row]);
    this.due.set(row.id, Date.now() + STAGE_MS);
    this.save();
    return of(row).pipe(delay(260));
  }

  approve(workspaceId: number, agentNumber: number, decision: 'APPROVE' | 'REWORK' | 'REJECT', comments: string): Observable<MockWorkflow> {
    const rows = this.flows();
    const row = [...rows].reverse().find(f => f.workspaceId === workspaceId && f.sequenceNumber === agentNumber);
    if (!row) return throwError(() => ({ status: 404, error: { message: 'No workflow at that stage' } }));
    if (row.state !== 'IN_REVIEW') {
      return throwError(() => ({ status: 409, error: { message: `Stage is ${row.state}, not IN_REVIEW` } }));
    }

    const now = new Date().toISOString();
    if (decision === 'APPROVE') {
      this.patch(row.id, { state: 'APPROVED', updatedAt: now, comments });
      const next = agentNumber + 1;
      if (next <= 10) {
        const nr = this.newRow(workspaceId, next);
        this.flows.update(l => [...l, nr]);
        this.due.set(nr.id, Date.now() + STAGE_MS);
      }
    } else if (decision === 'REWORK') {
      // Re-runs the same stage. A new row, so the history shows the rework.
      this.patch(row.id, { state: 'REWORK', updatedAt: now, comments });
      const again = this.newRow(workspaceId, agentNumber);
      this.flows.update(l => [...l, again]);
      this.due.set(again.id, Date.now() + STAGE_MS);
    } else {
      this.patch(row.id, { state: 'REJECTED', updatedAt: now, comments });
    }
    this.save();
    return of({ ...row, state: decision }).pipe(delay(300));
  }

  /** The document for a stage, rendered from the workspace's brief. */
  agentOutput(agentNumber: number, workspaceId: number): Observable<any> {
    const ws = this.spaces().find(w => w.id === workspaceId);
    if (!ws) return of({ content: null }).pipe(delay(120));

    const row = [...this.flows()].reverse()
      .find(f => f.workspaceId === workspaceId && f.sequenceNumber === agentNumber);
    // Nothing to show until the stage has actually produced something.
    if (!row || row.state === 'IN_PROGRESS' || row.state === 'PENDING') {
      return of({ content: null }).pipe(delay(120));
    }

    const brief = byId(ws.briefId);
    const story = this.storyFor(ws, agentNumber);
    const content = renderAgent(brief, agentNumber, ws.pipelineMode, story);
    return of({ content, agentNumber, workspaceId }).pipe(delay(180));
  }

  /** In per-story mode, stages 5–10 are scoped to one story. */
  private storyFor(ws: MockWorkspace, stage: number): Story | undefined {
    if (ws.pipelineMode !== 'per-story' || !STORY_SCOPED.has(stage)) return undefined;
    const brief = byId(ws.briefId);
    return brief.stories[1] ?? brief.stories[0];
  }

  // -------------------------------------------------------------------- tick
  /** Moves running stages into review when their time is up. */
  private tick() {
    const now = Date.now();
    let changed = false;
    for (const [id, at] of [...this.due]) {
      if (now < at) continue;
      this.due.delete(id);
      this.patch(id, { state: 'IN_REVIEW', updatedAt: new Date().toISOString() });
      changed = true;
    }
    if (changed) this.save();
  }

  // ------------------------------------------------------------------ helper
  private newRow(workspaceId: number, stage: number): MockWorkflow {
    const l = LINE[stage - 1];
    const ws = this.spaces().find(w => w.id === workspaceId);
    return {
      id: this.seq++, workspaceId, requirementId: 1,
      agentName: l.a, sequenceNumber: stage, state: 'IN_PROGRESS',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      storyId: ws && ws.pipelineMode === 'per-story' && STORY_SCOPED.has(stage)
        ? byId(ws.briefId).stories[1]?.id : undefined,
    };
  }
  private patch(id: number, p: Partial<MockWorkflow>) {
    this.flows.update(l => l.map(f => f.id === id ? { ...f, ...p } : f));
  }

  /** Drop everything and start over — wired to a control in the shell. */
  reset() {
    this.spaces.set([]); this.flows.set([]);
    this.seq = 1; this.wsSeq = 1; this.due.clear();
    this.save();
  }

  /**
   * A finished run, instantly. The single most useful thing for a demo: a
   * prospect should be able to see ten completed stages without waiting
   * through the pipeline first.
   */
  seedCompleted(briefId: string, mode: Mode = 'full-sequence'): number {
    const brief = byId(briefId);
    const id = this.wsSeq++;
    const ws: MockWorkspace = {
      id, projectName: brief.title, description: brief.summary,
      techStack: brief.stack, pipelineMode: mode, briefId: brief.id, status: true,
      location: `workspaces/workspace-${id}_${slug(brief.title)}`,
      createdAt: new Date(Date.now() - 864e5).toISOString(),
    };
    this.spaces.update(l => [...l, ws]);
    const rows: MockWorkflow[] = LINE.map((l, i) => ({
      id: this.seq++, workspaceId: id, requirementId: 1,
      agentName: l.a, sequenceNumber: l.n,
      state: i < 9 ? 'APPROVED' : 'IN_REVIEW',
      createdAt: new Date(Date.now() - (10 - i) * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - (9 - i) * 36e5).toISOString(),
    }));
    this.flows.update(l => [...l, ...rows]);
    this.save();
    return id;
  }

  // ------------------------------------------------------------ persistence
  private save() {
    try {
      const p: Persisted = { spaces: this.spaces(), flows: this.flows(), seq: this.seq, wsSeq: this.wsSeq };
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch { /* private mode — the demo still works, it just will not persist */ }
  }
  private restore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const p: Persisted = JSON.parse(raw);
      this.spaces.set(p.spaces ?? []);
      // Anything left mid-run when the tab closed lands in review rather than
      // hanging at IN_PROGRESS forever with no timer to finish it.
      this.flows.set((p.flows ?? []).map(f => f.state === 'IN_PROGRESS' ? { ...f, state: 'IN_REVIEW' } : f));
      this.seq = p.seq ?? 1; this.wsSeq = p.wsSeq ?? 1;
    } catch { /* corrupt state is not worth crashing the demo over */ }
  }

  /** Convenience for the console. */
  readonly stats = computed(() => {
    const f = this.flows();
    return {
      spaces: this.spaces().length,
      total: f.length,
      running: f.filter(x => x.state === 'IN_PROGRESS').length,
      review: f.filter(x => x.state === 'IN_REVIEW').length,
      approved: f.filter(x => x.state === 'APPROVED').length,
    };
  });
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
