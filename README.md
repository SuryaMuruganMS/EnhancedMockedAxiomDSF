# MockedAXIOM — front-end showcase build

A complete, self-contained demo of the AxiomDSF interface. **No backend, no Claude
CLI, no API keys.** Every agent document is generated in the browser.

Built as a portfolio piece: a prospect can open one link, run the pipeline, read
real engineering output and approve stages, with nothing to install.

---

## What is mocked

| Real system | Here |
|---|---|
| Spring Boot API | `src/app/mock/mock-api.ts` — in-memory, persists to `localStorage` |
| Claude Code CLI spawning 10 agents | `src/app/mock/render.ts` — 10 document renderers |
| A pasted requirement | `src/app/mock/catalog.ts` — 6 ready-made briefs |
| SQLite per operator | `localStorage` under `axiom.mock.state` |

A run still takes time: each stage sits `IN_PROGRESS` for ~3.4s before landing
`IN_REVIEW`. The product is about watching ten stages progress and approving
between them — instant completion would leave nothing to look at.

## The six requirements

Each is a real problem domain with its own actors, business rules, concurrency
trap and vulnerability profile, so the ten agents produce genuinely different
work for each one.

| Brief | Domain | The hard problem |
|---|---|---|
| Appointment Booking & Reminders | Healthcare | Two patients booking one slot at the same instant |
| Conference Room Booking | Workplace | Overlapping bookings under a Monday-morning burst |
| Fleet Telematics & Maintenance | Logistics | A condition that must hold *continuously*, on an at-least-once stream |
| Multi-Tenant Usage Billing | B2B SaaS finance | Two runs over one period must produce byte-identical invoices |
| Warehouse Inventory & Replenishment | Retail supply chain | Never overselling the last unit at 60 req/s |
| Student Enrolment & Timetabling | Higher education | 6,000 students hitting one module at 09:00 |

Six briefs × 10 agents ≈ **12,000 words of output per brief**. Stages 5–10 are
scoped to a single user story in per-story mode, and cover the whole
requirement in full-sequence mode.

## Why data and renderers, not 60 markdown files

The ten agents need a *consistent* view of one domain: the story IDs US emits
must be the ones TR writes scenarios for, which must be the ones TDD writes
tests for, against the classes LLD specified. That through-line is the first
thing a reviewer looks for. Sixty prose files drift; one source of truth cannot.

---

## Running it

```bash
npm install
npx ng serve --port 4300
```

Then open <http://127.0.0.1:4300>.

### Single-file build

```bash
npx ng build --configuration production
node build-single-file.mjs
```

Produces `axiom-demo.html` (~880 KB) with every script, stylesheet and image
inlined. Opens from any static host — or straight off the filesystem. Only
Google Fonts is still fetched.

Two things make that possible and are specific to this build:

- **Hash routing** (`withHashLocation()` in `main.ts`) — a deep link like
  `/#/workspaces/1` is served by `index.html` on any host, with no SPA rewrite
  rule to configure.
- **Eager routes** (`app.routes.ts`) — the production app lazy-loads each page;
  a lazy chunk is a network request for a URL that does not exist inside a
  single file.

## Demo controls

- **Spaces → "Load a finished run"** — drops in a completed ten-stage pipeline
  so the output is readable immediately, without waiting through the pipeline.
- **Ctrl/Cmd-K** — command palette, including *Load a finished run* and
  *Reset demo data*.
- **Rail → "Reset demo data"** — clears every workspace and run.

## Differences from the production app

- No `HttpClient` anywhere in the bundle.
- Sign-in is device-local (PBKDF2 in `core/auth.ts`); it is a UI demonstration,
  not a security boundary.
- Mermaid diagrams render as labelled source figures rather than drawn graphs —
  pulling a ~1 MB renderer off a CDN to draw six boxes is not a trade worth
  making in a single-file build.
- Health figures are synthetic but move, so the gauges are not flat lines.
