import { Brief, Story } from './catalog';

/* ===========================================================================
   Agent document renderers.
   ---------------------------------------------------------------------------
   Ten functions, one per pipeline stage, each turning a Brief into the kind of
   document that agent actually produces. They share one domain model, so the
   story IDs the US agent emits are the ones TR writes scenarios for, which are
   the ones TDD writes tests for, against the classes LLD specified. That
   through-line is the whole point of the pipeline and it is what a reviewer
   looks for first.

   `mode` changes the shape downstream of US: in per-story mode stages TR→SEC
   are scoped to a single story rather than the whole requirement.
   =========================================================================== */

export type Mode = 'per-story' | 'full-sequence';

const NOW = '2026-08-29';

/** Markdown table from a header row and body rows. */
const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(' | ')} |`,
   `|${head.map(() => '---').join('|')}|`,
   ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');

const meta = (b: Brief, agent: string, mode: Mode, story?: Story) =>
  `> **Agent** ${agent} · **Workspace** ${b.title} · **Mode** ${mode}` +
  (story ? ` · **Scope** ${story.id} ${story.title}` : '') +
  `\n> **Generated** ${NOW} · **Stack** ${b.stack}\n`;

/* ------------------------------------------------------------------ 1 REQ */
export function req(b: Brief, mode: Mode): string {
  return `# Requirement Analysis — ${b.title}

${meta(b, 'RequirementAnalysisRefinementAgent', mode)}
## 1. Structured summary

### 1.1 Purpose
${b.summary} This document refines the raw brief into a scoped, testable requirement package. Nothing below is invented: where the brief is silent, the gap is raised in §5 rather than assumed.

### 1.2 Domain context
${table(['Metric', 'Value'], b.metrics.map(m => [m.k, m.v]))}

### 1.3 Actors and responsibilities
${table(['Actor', 'Responsibilities'], b.actors.map(a => [`**${a.name}**`, a.can]))}

## 2. Scope

### 2.1 In scope
${b.stories.map(s => `- **${s.id}** ${s.title} — ${s.want}`).join('\n')}

### 2.2 Explicitly out of scope
${b.outOfScope.map(o => `- ${o}`).join('\n')}

Anything not listed in §2.1 is out of scope by default. Adding to §2.1 after
approval is a change request, not a clarification.

## 3. Business rules

These are the rules the downstream stages must preserve. Each is stated so it
can be tested rather than interpreted.

${table(['ID', 'Rule'], b.rules.map(r => [`\`${r.id}\``, r.text]))}

## 4. Constraints

### 4.1 Non-functional
${table(['Attribute', 'Requirement'], b.nfrs.map(n => [n.k, n.v]))}

### 4.2 Integration constraints
${b.integrations.map(i => `- ${i}`).join('\n')}

### 4.3 Data and retention
Personal data in scope is limited to what the brief names. Retention is stated
in §4.1 and must be implemented as an enforced policy, not a convention.

## 5. Open questions

The brief does not settle these. Each one changes the design, so each needs an
answer before the affected stage is approved. They are **not** blocking this
document — they are blocking the stages named.

${table(['#', 'Question', 'Blocks'],
  b.unknowns.map((q, i) => [String(i + 1), q, i < 2 ? 'HLS, HLD' : i < 4 ? 'LLD' : 'CODE']))}

## 6. Acceptance criteria

Deterministic and measurable. "Fast", "reliable" and "user-friendly" do not
appear; every criterion below can be evaluated to true or false.

${b.rules.map((r, i) => `**AC-${String(i + 1).padStart(2, '0')}** (${r.id}) — ${r.text}`).join('\n\n')}

${b.nfrs.map((n, i) => `**AC-${String(b.rules.length + i + 1).padStart(2, '0')}** (NFR) — ${n.k}: ${n.v}`).join('\n\n')}

## 7. Risks identified at analysis time

${table(['Risk', 'Impact', 'Proposed mitigation'], b.risks.map(r => [r.r, r.i, r.mit]))}

## 8. Handoff to HLS

The solution stage needs to resolve, in order:

1. **${b.hardProblem.title}** — the central technical problem. ${b.hardProblem.body}
2. A persistence choice that can enforce the invariants in §3 rather than relying on application code.
3. An integration strategy for the systems in §4.2 that keeps a third-party outage from failing a core transaction.
4. A position on open questions 1 and 2 in §5, or an explicit decision to defer them with a stated cost.

**Artifact status:** complete. ${b.stories.length} candidate stories, ${b.rules.length} business rules,
${b.nfrs.length} non-functional constraints, ${b.unknowns.length} open questions.`;
}

/* ------------------------------------------------------------------ 2 HLS */
export function hls(b: Brief, mode: Mode): string {
  return `# High-Level Solution — ${b.title}

${meta(b, 'HLSAgent', mode)}
## 1. Solution overview

${b.summary} The solution is a single deployable service exposing a REST API,
backed by ${b.stackList[2]}, with asynchronous work handled off the request
path. The architecture is driven by one constraint above all others:
**${b.hardProblem.title.toLowerCase()}**.

## 2. Technology selection

${table(['Layer', 'Choice', 'Rationale'], [
  ['Language / runtime', b.stackList[0], 'Team fluency and a mature ecosystem for the integration surface in the requirement.'],
  ['Framework', b.stackList[1], 'First-class support for the security, validation and observability the NFRs demand without bespoke plumbing.'],
  ['Datastore', b.stackList[2], 'Chosen specifically because it can enforce the core invariant declaratively — see §4, ADR-001.'],
  ['Async / messaging', b.stackList[3] ?? 'In-process outbox', 'Keeps third-party calls off the transaction path so an outage degrades rather than fails.'],
  ['Migrations', b.stackList[4] ?? 'Versioned SQL', 'Schema is a reviewed artifact; the invariant lives there and must be version-controlled.'],
  ['Testing', b.stackList[5] ?? 'Testcontainers', 'The invariant is enforced by the database, so it must be tested against a real one, not a mock.'],
])}

## 3. Component overview

${table(['Component', 'Responsibility', 'Scale profile'], [
  ['API layer', 'Request validation, authentication, authorisation, response mapping.', 'Stateless, horizontally scaled.'],
  ['Domain core', 'Business rules from REQ §3. Pure, no I/O, exhaustively unit tested.', 'CPU-bound, trivial.'],
  ['Persistence adapter', 'Repository implementations; owns the schema-level invariant.', 'Connection-pool bound.'],
  ['Async worker', 'Outbox dispatch, scheduled evaluation, retries with backoff.', 'Scales on queue depth, not request rate.'],
  ['Integration adapters', 'One per external system in REQ §4.2, behind an outbound port.', 'Isolated; failure is contained.'],
])}

## 4. Architecture decisions

### ADR-001 — The core invariant is enforced by the database

**Context.** ${b.hardProblem.body}

**Decision.** ${b.hardProblem.solution}

**Consequences.** The invariant holds against any writer, including a future
service or a manual correction, and cannot be regressed by an application
refactor. The cost is that the constraint is expressed in SQL rather than in
domain code, so the schema becomes a reviewed artifact and the test suite needs
a real database rather than an in-memory substitute.

**Rejected alternatives.**
- *Application-level locking* — serialises the hottest path and still fails against a second writer.
- *Optimistic version checks* — detects a conflicting update but not a conflicting insert, which is the actual failure mode.
- *Eventual reconciliation* — detects the breach after a promise has already been made to a user. The requirement asks for prevention.

### ADR-002 — Hexagonal boundaries around every external system

**Context.** ${b.integrations.length} external systems, and the requirement is
explicit that a third-party failure must not fail a core operation.

**Decision.** Each external system sits behind an outbound port with the
adapter chosen at composition. Anything that must happen as a consequence of a
committed transaction is written to an outbox in that same transaction and
dispatched afterwards by a worker.

**Consequences.** Core transactions never make network calls. Delivery becomes
at-least-once, so every adapter carries an idempotency key. Tests for the core
need no external stubs.

### ADR-003 — Identity is verified, never asserted

**Context.** The requirement states the service receives a signed token and
must verify it before trusting identity or role.

**Decision.** Resource-server style validation with rotating JWKS. Authorities
derive from validated claims only. No header, query parameter or body field
contributes to an authorisation decision.

**Consequences.** Authorisation is testable in isolation, and the class of bug
where a caller sets their own role is structurally impossible.

## 5. Non-functional strategy

${table(['Requirement', 'Approach'], b.nfrs.map(n => [`**${n.k}** — ${n.v}`, nfrApproach(n.k)]))}

## 6. Risk register

${table(['Risk', 'Impact', 'Mitigation'], b.risks.map(r => [r.r, r.i, r.mit]))}

## 7. Deployment

- Single container image, configuration by environment, no per-environment builds.
- Migrations run on startup, gated so only one instance applies them.
- Health endpoints: liveness (process), readiness (datastore and migration state).
- Observability: structured JSON logs with a correlation id, metrics for every NFR in §5, traces across the async boundary.
- Rollback is a redeploy of the prior image; migrations are additive so the previous version keeps running against the new schema.

## 8. Handoff to HLD

HLD should decompose §3 into containers, draw the interaction for the primary
flow including the failure path from ADR-001, and specify the integration seams
for §4.2. Open questions 1 and 2 from REQ §5 remain unresolved and are flagged
as design assumptions to be confirmed.`;
}

const nfrApproach = (k: string): string => {
  const s = k.toLowerCase();
  if (s.includes('latency') || s.includes('lookup') || s.includes('search')) return 'Indexed access paths sized to the query, a read cache for the hot path invalidated on write, and a load test asserting the percentile in CI.';
  if (s.includes('throughput') || s.includes('ingest') || s.includes('concurrency')) return 'Horizontal scale behind a bounded connection pool; a queue absorbs bursts so the datastore sees a smooth rate.';
  if (s.includes('availability')) return 'Multiple stateless instances, health-gated rolling deploys, and graceful degradation of non-critical paths only.';
  if (s.includes('retention')) return 'An enforced lifecycle policy with a scheduled job, plus a test that asserts records past the boundary are gone.';
  if (s.includes('recovery') || s.includes('durab')) return 'Point-in-time recovery on the datastore; all side effects idempotent so a replay is safe.';
  if (s.includes('determinism') || s.includes('precision') || s.includes('correct')) return 'Pure calculation core with property-based tests over boundary values; no floating point in any money or quantity path.';
  if (s.includes('rate')) return 'Token bucket per authenticated subject at the edge, with headers exposing the remaining budget.';
  if (s.includes('audit')) return 'Append-only table written in the same transaction as the change it records; no update or delete grant.';
  if (s.includes('fair')) return 'Strict ordering enforced by a single serialised worker rather than by request threads.';
  if (s.includes('atomic')) return 'One transaction spanning the whole operation; partial success is not representable.';
  return 'Measured directly, with an alert on the threshold and a regression test in CI.';
};

/* ------------------------------------------------------------------ 3 HLD */
export function hld(b: Brief, mode: Mode): string {
  const core = b.entities[0], hot = b.entities.find(e => /appointment|booking|allocation|invoice|enrolment|alert/i.test(e.name)) ?? b.entities[1];
  return `# High-Level Design — ${b.title}

${meta(b, 'HLDAgent', mode)}
## 1. Context

\`\`\`mermaid
graph LR
  U["${b.actors[0].name}"] --> API["${b.short} API"]
  S["${b.actors[1].name}"] --> API
  API --> DB[("${b.stackList[2]}")]
  API --> Q[["Outbox / queue"]]
  Q --> EXT["External systems"]
  IDP["Identity provider"] -.verifies.-> API
\`\`\`

The service owns its datastore. No other system reads or writes it directly;
every access is through the API, which is what makes the ADR-001 invariant
meaningful.

## 2. Container decomposition

${table(['Container', 'Technology', 'Responsibility', 'Talks to'], [
  ['api', b.stackList[1], 'HTTP surface, authn/authz, validation, mapping.', 'domain, persistence'],
  ['domain', b.stackList[0], 'Business rules. Pure functions over value objects.', '— (no I/O)'],
  ['persistence', b.stackList[2] + ' adapter', 'Repositories, schema, the declarative invariant.', 'database'],
  ['worker', b.stackList[3] ?? 'scheduler', 'Outbox dispatch, scheduled evaluation, retries.', 'persistence, adapters'],
  ['adapters', 'per integration', 'One class per external system, behind a port.', 'external systems'],
])}

## 3. Component interactions — primary flow

The flow below is the one ADR-001 exists for. Note that the failure branch is
a first-class path, not an exception handler.

\`\`\`mermaid
sequenceDiagram
  actor A as ${b.actors[0].name}
  participant API as API
  participant D as Domain
  participant R as Repository
  participant DB as Database
  participant O as Outbox

  A->>API: ${b.endpoints[1].m} ${b.endpoints[1].p}
  API->>API: verify token, derive authorities
  API->>D: validate against business rules
  D-->>API: ok / violations
  alt violations
    API-->>A: 422 with rule ids
  else valid
    API->>R: persist
    R->>DB: write guarded by the invariant
    alt constraint rejects
      DB-->>R: conflict
      R-->>API: ConflictException
      API-->>A: 409 domain code
    else accepted
      DB-->>R: committed
      R->>O: enqueue side effects (same transaction)
      API-->>A: 201 Created
    end
  end
  Note over O: dispatched after commit,<br/>never inside the transaction
\`\`\`

## 4. Data model

\`\`\`mermaid
erDiagram
  ${core.name.toUpperCase()} ||--o{ ${hot.name.toUpperCase()} : has
  ${b.entities[2].name.toUpperCase()} ||--o{ ${hot.name.toUpperCase()} : governs
  ${hot.name.toUpperCase()} ||--o{ AUDIT_EVENT : records
\`\`\`

${b.entities.map(e => `### ${e.name}

${e.note}

${e.fields.map(f => `- \`${f}\``).join('\n')}`).join('\n\n')}

## 5. API surface

${table(['Method', 'Path', 'Purpose', 'Authorised roles'],
  b.endpoints.map(e => [`\`${e.m}\``, `\`${e.p}\``, e.d, e.role]))}

### Error model

A single problem-detail shape across every endpoint. Domain codes are stable
and documented; driver or framework text is never surfaced.

${table(['Status', 'Code', 'Meaning'], [
  ['400', 'VALIDATION_FAILED', 'Malformed or missing input.'],
  ['401', 'UNAUTHENTICATED', 'Token absent, expired or unverifiable.'],
  ['403', 'FORBIDDEN', 'Authenticated but not permitted on this resource.'],
  ['404', 'NOT_FOUND', 'Resource does not exist. Never used to mask a 403.'],
  ['409', 'CONFLICT', 'The core invariant rejected the write. Domain code names which.'],
  ['422', 'RULE_VIOLATION', 'Well-formed but violates a business rule; body lists rule ids.'],
  ['429', 'RATE_LIMITED', 'Budget exhausted; Retry-After set.'],
])}

## 6. Integration points

${table(['System', 'Direction', 'Protocol', 'Failure behaviour'],
  b.integrations.map(i => {
    const name = i.split('—')[0].trim();
    return [name, /webhook|emits|posts/i.test(i) ? 'Inbound' : 'Outbound',
      /oidc|saml|sso/i.test(i) ? 'OIDC / JWKS' : /mqtt/i.test(i) ? 'MQTT + mTLS' : 'HTTPS / REST',
      /oidc|saml|sso/i.test(i) ? 'Fail closed — requests are rejected.' : 'Fail open — queued in the outbox and retried; the core operation still succeeds.'];
  }))}

## 7. Cross-cutting concerns

- **Authentication** — token verified at the edge; authorities from validated claims only (ADR-003).
- **Authorisation** — enforced in the repository query where the rule is data-scoped, so it cannot be bypassed by a new caller of the same repository.
- **Audit** — append-only, written in the transaction it describes.
- **Observability** — correlation id propagated across the async boundary; one metric per NFR.
- **Idempotency** — every mutating endpoint accepts an idempotency key; every outbound adapter sends one.

## 8. Handoff to User Stories

The US agent should decompose §3 and §5 into INVEST stories. Every story must
trace to at least one business rule from REQ §3, and the concurrency behaviour
in §3 needs its own story with an explicit edge case — it is the highest-risk
behaviour in the system and cannot be left implicit in a happy-path story.`;
}

/* ------------------------------------------------------------------ 4 US */
export function us(b: Brief, mode: Mode): string {
  const total = b.stories.reduce((a, s) => a + s.points, 0);
  return `# User Stories — ${b.title}

${meta(b, 'UserStoryAgent', mode)}
## Summary

${b.stories.length} stories, ${total} points. Every story is independently
testable and traces to at least one business rule from REQ §3. Stories are
ordered by dependency, not by value: ${b.stories[0].id} and ${b.stories[1].id}
must land before anything downstream is meaningful.

${table(['ID', 'Title', 'Points', 'Traces to', 'Priority'],
  b.stories.map((s, i) => [
    `**${s.id}**`, s.title, String(s.points),
    `\`${b.rules[Math.min(i, b.rules.length - 1)].id}\``,
    i < 2 ? 'P0' : i < 5 ? 'P1' : 'P2',
  ]))}

---

${b.stories.map(s => storyBlock(b, s)).join('\n\n---\n\n')}

---

## Dependency graph

\`\`\`mermaid
graph TD
${b.stories.map((s, i) => i === 0 ? `  ${s.id}["${s.id} ${s.title}"]`
  : `  ${b.stories[Math.max(0, i - 2)].id} --> ${s.id}["${s.id} ${s.title}"]`).join('\n')}
\`\`\`

## Handoff to Test Review

${mode === 'per-story'
  ? 'In per-story mode each story below now runs its own TR→SEC pipeline independently. The TR agent will be invoked once per story with that story as its scope.'
  : 'In full-sequence mode the TR agent receives all stories at once and produces one consolidated scenario set covering the whole requirement.'}

The highest-risk story is **${b.stories[1].id}** — it carries the concurrency
edge case, and its "exactly one wins" criterion is the acceptance test for
ADR-001. TR must write that scenario explicitly; it cannot be inferred from the
happy path.`;
}

function storyBlock(b: Brief, s: Story): string {
  return `## ${s.id} — ${s.title}

**As** ${s.as}
**I want** ${s.want}
**So that** ${s.so}

**Points:** ${s.points} · **Traces to:** ${b.rules.slice(0, 2).map(r => `\`${r.id}\``).join(', ')}

### Acceptance criteria

${s.ac.map((a, i) => {
  const m = a.match(/^Given (.+?), when (.+?), then (.+)$/i);
  return m
    ? `**AC${i + 1}**\n\`\`\`gherkin\nGiven ${m[1]}\nWhen ${m[2]}\nThen ${m[3]}\n\`\`\``
    : `**AC${i + 1}** — ${a}`;
}).join('\n\n')}

### Edge cases

${s.edge.map(e => `- ${e}`).join('\n')}

### Definition of done

- All acceptance criteria have an automated test that fails without the implementation.
- Every edge case above is covered by a test, not by a comment.
- API documented; error codes match the HLD §5 error model.
- No new finding above Medium from the SCA or SEC stages.`;
}

/* ------------------------------------------------------------------ 5 TR */
export function tr(b: Brief, mode: Mode, story?: Story): string {
  const scope = story ? [story] : b.stories;
  const n = scope.reduce((a, s) => a + s.ac.length + s.edge.length, 0);
  return `# Test Review — ${story ? `${story.id} ${story.title}` : b.title}

${meta(b, 'TRReviewAgent', mode, story)}
## 1. Coverage summary

${n} scenarios across ${scope.length} ${scope.length === 1 ? 'story' : 'stories'},
written before any implementation exists. Priorities: **P0** blocks release,
**P1** blocks the story, **P2** is desirable.

${table(['Story', 'Happy path', 'Rule violations', 'Edge cases', 'Total'],
  scope.map(s => [s.id, '1', String(s.ac.length - 1), String(s.edge.length), String(s.ac.length + s.edge.length)]))}

## 2. Feature files

${scope.map(s => `### ${s.id} — ${s.title}

\`\`\`gherkin
Feature: ${s.title}
  As ${s.as}
  I want ${s.want}
  So that ${s.so}

  Background:
    Given the system is configured per the ${b.short} business rules
    And I am authenticated as ${s.as.replace(/^an? /, '')}

${s.ac.map((a, i) => {
  const m = a.match(/^Given (.+?), when (.+?), then (.+)$/i);
  const tag = i === 0 ? '@P0 @happy-path' : '@P1 @rule';
  return `  ${tag}
  Scenario: ${m ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : a.slice(0, 62)}
    ${m ? `Given ${m[1]}\n    When ${m[2]}\n    Then ${m[3]}` : `Given the preconditions hold\n    When the operation is attempted\n    Then ${a}`}`;
}).join('\n\n')}

${s.edge.map((e, i) => `  @P${i === 0 ? '0' : '2'} @edge
  Scenario: ${e.slice(0, 62)}
    Given the edge condition described
    When the operation is attempted
    Then ${e}`).join('\n\n')}
\`\`\``).join('\n\n')}

## 3. The scenario that matters most

${b.hardProblem.title}. ${b.hardProblem.body}

\`\`\`gherkin
@P0 @concurrency @critical
Scenario: Concurrent requests contend for the same resource
  Given exactly one unit of the contended resource remains
  When 20 requests are submitted simultaneously for that unit
  Then exactly 1 request succeeds
  And 19 requests receive a 409 with a stable domain code
  And the resource is never oversubscribed
  And no request receives a 500
\`\`\`

This scenario cannot be satisfied by a mock. It requires a real database with
the ADR-001 constraint in place and genuine parallel execution; an in-memory
substitute will pass while the production system fails.

## 4. Coverage gaps and risks

${table(['Area', 'Risk if untested', 'Priority'], [
  ['Concurrency on the core invariant', 'The defect the project exists to fix ships undetected.', 'P0'],
  ['Authorisation on every mutating endpoint', 'Broken access control — the highest-frequency class in OWASP.', 'P0'],
  ['Boundary values on each numeric rule', 'Off-by-one on a business rule, silently wrong for years.', 'P1'],
  ['Idempotency of retried operations', 'Duplicate side effects under a flaky network.', 'P1'],
  ['Failure of each external adapter', 'A third-party outage cascades into core failure.', 'P1'],
  ['Retention and purge behaviour', 'A compliance commitment that was never actually implemented.', 'P2'],
])}

## 5. Handoff to TDD

Every scenario above becomes an executable test. The P0 concurrency scenario
must run against a real datastore. Test data builders should be shared so a
change to the domain model breaks compilation rather than silently skipping
assertions.`;
}

/* ------------------------------------------------------------------ 6 LLD */
export function lld(b: Brief, mode: Mode, story?: Story): string {
  const pkg = b.id;
  return `# Low-Level Design — ${story ? `${story.id} ${story.title}` : b.title}

${meta(b, 'LLDAgent', mode, story)}
## 1. Package structure

\`\`\`
com.acme.${pkg}
├── api
│   ├── ${cap(b.short)}Controller
│   ├── dto/            request and response records
│   └── ProblemDetailHandler
├── domain
│   ├── model/          entities and value objects
│   ├── policy/         business rules, pure
│   └── port/           outbound interfaces
├── persistence
│   ├── entity/         ORM mappings
│   ├── repository/     queries, invariant enforcement
│   └── migration/      versioned schema
├── integration/        one adapter per external system
└── worker/             outbox dispatch, scheduled evaluation
\`\`\`

The dependency rule is one-way: \`api → domain ← persistence\`. The domain
package imports nothing from the others, which is what makes the policies in
§3 unit-testable without infrastructure.

## 2. Data model — schema

\`\`\`sql
${schemaFor(b)}
\`\`\`

The exclusion constraint is the design. It is not an optimisation or a safety
net behind application logic — it is the only place the invariant is expressed,
and application code is written to expect its rejection.

## 3. Domain policies

Pure functions over value objects. No repository, no clock, no I/O — the clock
is passed in so time-dependent rules are testable without waiting.

\`\`\`java
package com.acme.${pkg}.domain.policy;

/**
 * Business rules from REQ §3. Every method returns violations rather than
 * throwing, so a caller can report all failures at once instead of the first.
 */
public final class ${cap(b.short)}Policy {

    private final ${cap(b.short)}Rules rules;   // config-bound, see §6

    /** ${b.rules[0].text} */
    public List<Violation> validate(${cap(b.short)}Request request, Context ctx) {
        var violations = new ArrayList<Violation>();
${b.rules.slice(0, 5).map(r => `        check${r.id.replace('-', '')}(request, ctx).ifPresent(violations::add);`).join('\n')}
        return List.copyOf(violations);
    }

${b.rules.slice(0, 3).map(r => `    /** ${r.id} — ${r.text} */
    private Optional<Violation> check${r.id.replace('-', '')}(${cap(b.short)}Request r, Context ctx) {
        // pure predicate over r and ctx; no I/O
        return Optional.empty();
    }`).join('\n\n')}
}
\`\`\`

## 4. Service layer

\`\`\`java
package com.acme.${pkg}.domain;

@Service
@RequiredArgsConstructor
public class ${cap(b.short)}Service {

    private final ${cap(b.short)}Repository repository;
    private final ${cap(b.short)}Policy policy;
    private final OutboxWriter outbox;
    private final Clock clock;

    /**
     * ${b.stories[1].title}.
     *
     * The invariant is enforced by the schema (§2), so this method performs an
     * optimistic write and translates the constraint violation. There is
     * deliberately no read-then-write check: it would be both redundant and
     * racy.
     */
    @Transactional
    public ${cap(b.short)}Result submit(${cap(b.short)}Command cmd, Actor actor) {
        var violations = policy.validate(cmd.toRequest(), Context.of(actor, clock));
        if (!violations.isEmpty()) {
            throw new RuleViolationException(violations);
        }
        try {
            var saved = repository.insert(cmd.toEntity(actor, clock.instant()));
            outbox.enqueue(Notification.created(saved));   // same transaction
            return ${cap(b.short)}Result.of(saved);
        } catch (ConstraintViolationException e) {
            throw new ConflictException(DomainCode.RESOURCE_UNAVAILABLE, e);
        }
    }
}
\`\`\`

## 5. Repository

\`\`\`java
public interface ${cap(b.short)}Repository {
    ${cap(b.short)}Entity insert(${cap(b.short)}Entity entity);
    Optional<${cap(b.short)}Entity> findByIdForActor(UUID id, Actor actor);
    Page<${cap(b.short)}Entity> search(SearchCriteria criteria, Actor actor, Pageable page);
}
\`\`\`

\`findByIdForActor\` takes the actor deliberately. Data-scoped authorisation is
applied in the query, not in the controller, so a future caller of this
repository cannot forget it.

## 6. Configuration

\`\`\`java
@ConfigurationProperties("${pkg}.rules")
public record ${cap(b.short)}Rules(
${b.rules.slice(0, 4).map((r, i) => `    ${['int', 'Duration', 'int', 'boolean'][i]} ${camel(r.id)}   // ${r.text.slice(0, 68)}…`).join(',\n')}
) {}
\`\`\`

Every constant named in REQ §3 is bound here. No business number appears inline
in a method — SCA flags that pattern and it makes the rules unsearchable.

## 7. Error mapping

${table(['Domain exception', 'HTTP', 'Code', 'Body'], [
  ['RuleViolationException', '422', 'RULE_VIOLATION', 'List of violated rule ids'],
  ['ConflictException', '409', 'RESOURCE_UNAVAILABLE', 'Stable domain code only'],
  ['NotFoundException', '404', 'NOT_FOUND', 'Resource type and id'],
  ['ForbiddenException', '403', 'FORBIDDEN', 'No detail — no resource probing'],
])}

The 409 body carries a domain code and nothing else. Leaking the constraint
name reveals the schema and the concurrency strategy.

## 8. Sequence — the conflict path

\`\`\`mermaid
sequenceDiagram
  participant S as Service
  participant R as Repository
  participant DB as Database
  S->>R: insert(entity)
  R->>DB: INSERT guarded by the constraint
  DB-->>R: SQLSTATE 23P01
  R-->>S: ConstraintViolationException
  S->>S: translate to ConflictException
  S-->>S: transaction rolls back, outbox row discarded
\`\`\`

The outbox write rolling back with the transaction is the point: a rejected
operation must not leave a queued notification behind.

## 9. Handoff to TDD

Test the policies in §3 as pure functions. Test the service against a real
database via Testcontainers — the invariant is in the schema, so an in-memory
substitute tests nothing that matters. The concurrency scenario from TR §3
needs genuine parallelism, not sequential calls.`;
}

function schemaFor(b: Brief): string {
  if (b.id === 'clinic' || b.id === 'rooms') {
    const t = b.id === 'clinic' ? 'appointment' : 'booking';
    const owner = b.id === 'clinic' ? 'practitioner_id' : 'room_id';
    return `CREATE TABLE ${t} (
    id            UUID PRIMARY KEY,
    ${owner.padEnd(13)} UUID NOT NULL REFERENCES ${owner.replace('_id', '')}(id),
    slot          TSTZRANGE NOT NULL,
    status        TEXT NOT NULL,
    created_by    TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    version       BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT ${t}_slot_valid CHECK (lower(slot) < upper(slot)),

    -- ADR-001. This is the invariant. Two overlapping confirmed rows for the
    -- same ${owner.replace('_id', '')} cannot exist at any isolation level.
    CONSTRAINT ${t}_no_overlap EXCLUDE USING gist (
        ${owner} WITH =,
        slot     WITH &&
    ) WHERE (status = 'CONFIRMED')
);

CREATE INDEX ${t}_lookup ON ${t} USING gist (slot) WHERE status = 'CONFIRMED';`;
  }
  if (b.id === 'warehouse') {
    return `CREATE TABLE stock_position (
    sku_id      UUID NOT NULL REFERENCES sku(id),
    location_id UUID NOT NULL REFERENCES location(id),
    on_hand     INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    allocated   INTEGER NOT NULL DEFAULT 0 CHECK (allocated >= 0),
    version     BIGINT  NOT NULL DEFAULT 0,
    PRIMARY KEY (sku_id, location_id),

    -- BR-01: available is derived and can never be negative.
    CONSTRAINT never_oversold CHECK (on_hand >= allocated)
);

-- ADR-001. Check and reserve in one atomic statement; zero rows means
-- insufficient stock. No read-then-write window, no application lock.
-- UPDATE stock_position
--    SET allocated = allocated + :qty
--  WHERE sku_id = :sku AND location_id = :loc
--    AND on_hand - allocated >= :qty;`;
  }
  if (b.id === 'enrolment') {
    return `CREATE TABLE module (
    id             UUID PRIMARY KEY,
    code           TEXT NOT NULL UNIQUE,
    capacity       INTEGER NOT NULL CHECK (capacity > 0),
    enrolled_count INTEGER NOT NULL DEFAULT 0,

    -- BR-06: capacity can never be exceeded, whatever the concurrency.
    CONSTRAINT capacity_not_exceeded CHECK (enrolled_count <= capacity)
);

CREATE TABLE enrolment (
    id         UUID PRIMARY KEY,
    student_id UUID NOT NULL,
    module_id  UUID NOT NULL REFERENCES module(id),
    term_id    UUID NOT NULL,
    state      TEXT NOT NULL,
    UNIQUE (student_id, module_id, term_id)
);

-- ADR-001. Claim a place atomically; zero rows means full.
-- UPDATE module SET enrolled_count = enrolled_count + 1
--  WHERE id = :module AND enrolled_count < capacity;`;
  }
  if (b.id === 'billing') {
    return `CREATE TABLE usage_event (
    id          TEXT PRIMARY KEY,          -- idempotency key, BR-01
    tenant_id   UUID NOT NULL,
    dimension   TEXT NOT NULL,
    quantity    NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX usage_period ON usage_event (tenant_id, dimension, occurred_at);

CREATE TABLE invoice (
    id           UUID PRIMARY KEY,
    tenant_id    UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end   DATE NOT NULL,
    plan_version INTEGER NOT NULL,          -- pinned, BR-07
    state        TEXT NOT NULL,
    subtotal     NUMERIC(20,2) NOT NULL,    -- NUMERIC, never float
    total        NUMERIC(20,2) NOT NULL,

    -- A crashed billing run must resume, not duplicate.
    UNIQUE (tenant_id, period_start)
);`;
  }
  return `CREATE TABLE telemetry_frame (
    vehicle_id  UUID NOT NULL REFERENCES vehicle(id),
    at          TIMESTAMPTZ NOT NULL,
    position    GEOGRAPHY(POINT, 4326),
    odometer_km BIGINT,
    coolant_c   NUMERIC(5,2),
    dtcs        TEXT[],

    -- BR-09: at-least-once delivery, so identity must be idempotent.
    PRIMARY KEY (vehicle_id, at)
);
SELECT create_hypertable('telemetry_frame', 'at', chunk_time_interval => INTERVAL '1 day');

CREATE TABLE alert (
    id          UUID PRIMARY KEY,
    rule_id     UUID NOT NULL,
    vehicle_id  UUID NOT NULL,
    raised_at   TIMESTAMPTZ NOT NULL,
    cleared_at  TIMESTAMPTZ,

    -- BR-06: one open alert per rule and vehicle; re-firing updates.
    CONSTRAINT one_open_alert EXCLUDE (rule_id WITH =, vehicle_id WITH =)
        WHERE (cleared_at IS NULL)
);`;
}

/* ------------------------------------------------------------------ 7 TDD */
export function tdd(b: Brief, mode: Mode, story?: Story): string {
  const s = story ?? b.stories[1];
  return `# Test Strategy & Suite — ${story ? `${story.id} ${story.title}` : b.title}

${meta(b, 'TDDAgent', mode, story)}
## 1. Strategy

${table(['Level', 'What', 'Tooling', 'Share'], [
  ['Unit', 'Domain policies — pure, no infrastructure.', 'JUnit 5 + AssertJ', '~60%'],
  ['Integration', 'Repositories and the schema invariant.', 'Testcontainers (real database)', '~30%'],
  ['Contract', 'Outbound adapters against recorded interactions.', 'WireMock', '~5%'],
  ['End-to-end', 'The P0 journeys only.', 'RestAssured', '~5%'],
])}

The invariant lives in the schema, so it is tested against a real database. An
in-memory substitute would pass this suite while production oversold.

## 2. Test order

Written in dependency order so each file compiles against the previous one.

${table(['#', 'File', 'Covers', 'Priority'], [
  ['1', `${cap(b.short)}PolicyTest`, 'Every business rule as a pure predicate', 'P0'],
  ['2', `${cap(b.short)}RepositoryIT`, 'Schema invariant, including the conflict path', 'P0'],
  ['3', `${cap(b.short)}ConcurrencyIT`, 'The contended-resource scenario from TR §3', 'P0'],
  ['4', `${cap(b.short)}ServiceTest`, 'Orchestration, outbox, error translation', 'P1'],
  ['5', `${cap(b.short)}ControllerTest`, 'Authorisation and the error model', 'P0'],
  ['6', `${cap(b.short)}IdempotencyIT`, 'Retried operations do not duplicate', 'P1'],
])}

## 3. Policy tests

\`\`\`java
class ${cap(b.short)}PolicyTest {

    private final Clock fixed = Clock.fixed(Instant.parse("2026-08-29T09:00:00Z"), UTC);
    private final ${cap(b.short)}Policy policy = new ${cap(b.short)}Policy(TestRules.defaults());

${b.rules.slice(0, 3).map(r => `    @Nested
    @DisplayName("${r.id} — ${r.text.slice(0, 60)}…")
    class ${r.id.replace('-', '')} {

        @Test
        void accepts_a_request_that_satisfies_the_rule() {
            var request = a${cap(b.short)}Request().valid().build();
            assertThat(policy.validate(request, ctx())).isEmpty();
        }

        @Test
        void rejects_a_request_that_violates_the_rule() {
            var request = a${cap(b.short)}Request().violating${r.id.replace('-', '')}().build();
            assertThat(policy.validate(request, ctx()))
                .extracting(Violation::ruleId)
                .containsExactly("${r.id}");
        }

        @ParameterizedTest
        @MethodSource("boundaryValues")
        void handles_the_boundary_exactly(int value, boolean expectedValid) {
            var request = a${cap(b.short)}Request().withValue(value).build();
            assertThat(policy.validate(request, ctx()).isEmpty()).isEqualTo(expectedValid);
        }
    }`).join('\n\n')}
}
\`\`\`

## 4. The concurrency test

This is the test the project exists for. It runs against a real database and
uses genuine parallelism.

\`\`\`java
@SpringBootTest
@Testcontainers
class ${cap(b.short)}ConcurrencyIT {

    @Container
    static final PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:15");

    @Autowired ${cap(b.short)}Service service;

    @Test
    @DisplayName("${b.hardProblem.title}: exactly one of 20 concurrent requests wins")
    void exactly_one_wins() throws Exception {
        var contended = givenExactlyOneUnitRemains();

        var threads = 20;
        var start = new CountDownLatch(1);
        var done  = new CountDownLatch(threads);
        var wins  = new AtomicInteger();
        var conflicts = new AtomicInteger();
        var errors = new CopyOnWriteArrayList<Throwable>();

        var pool = Executors.newFixedThreadPool(threads);
        for (int i = 0; i < threads; i++) {
            pool.submit(() -> {
                try {
                    start.await();                       // release all at once
                    service.submit(commandFor(contended), anActor());
                    wins.incrementAndGet();
                } catch (ConflictException expected) {
                    conflicts.incrementAndGet();
                } catch (Throwable unexpected) {
                    errors.add(unexpected);              // a 500 is a failure
                } finally {
                    done.countDown();
                }
            });
        }
        start.countDown();
        assertThat(done.await(30, SECONDS)).isTrue();
        pool.shutdownNow();

        assertThat(errors).isEmpty();
        assertThat(wins.get()).isEqualTo(1);
        assertThat(conflicts.get()).isEqualTo(threads - 1);
        assertThat(remainingUnits(contended)).isZero();   // never oversold
    }
}
\`\`\`

Note what is asserted: not only that one succeeded, but that the other 19 got a
*clean* 409 rather than a 500, and that the resource was never oversubscribed.
A implementation that throws a raw driver exception fails this test.

## 5. Authorisation tests

\`\`\`java
@WebMvcTest(${cap(b.short)}Controller.class)
class ${cap(b.short)}ControllerTest {

${b.endpoints.slice(0, 4).map(e => `    @Test
    void ${e.m.toLowerCase()}_${e.p.split('/').filter(Boolean).pop()!.replace(/[{}]/g, '')}_rejects_an_unauthorised_caller() throws Exception {
        mvc.perform(${e.m.toLowerCase()}("${e.p.replace(/\{[^}]+\}/g, '{id}')}", UUID.randomUUID())
                .with(jwt().authorities(wrongAuthorityFor("${e.role}"))))
           .andExpect(status().isForbidden())
           .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }`).join('\n\n')}

    @Test
    void a_resource_belonging_to_another_subject_is_403_not_404() throws Exception {
        // 404 here would let a caller probe for the existence of other
        // subjects' resources by timing or status alone.
        mvc.perform(get("/api/v1/resource/{id}", someoneElsesId())
                .with(jwt().authorities(validAuthority())))
           .andExpect(status().isForbidden());
    }
}
\`\`\`

## 6. Fixtures

\`\`\`java
public final class ${cap(b.short)}Fixtures {
    public static ${cap(b.short)}RequestBuilder a${cap(b.short)}Request() { … }
    public static Actor anActor() { … }
    public static Context ctx() { … }
}
\`\`\`

Builders are shared across every level. A change to the domain model breaks
compilation rather than silently skipping assertions — which is the failure
mode of map-based fixtures.

## 7. Coverage targets

${table(['Package', 'Line', 'Branch', 'Rationale'], [
  ['domain.policy', '100%', '100%', 'Pure and small. Anything less means a rule is untested.'],
  ['domain', '≥ 90%', '≥ 85%', 'Orchestration; the error paths matter as much as the happy one.'],
  ['persistence', '≥ 80%', '≥ 75%', 'Covered by integration tests against a real database.'],
  ['api', '≥ 85%', '≥ 80%', 'Every authorisation branch must be exercised.'],
])}

Coverage is a floor, not a goal. The three P0 tests above matter more than the
percentage; ${s.id}'s concurrency case is the one that would have caught the
original defect.`;
}

/* ------------------------------------------------------------------ 8 CODE */
export function code(b: Brief, mode: Mode, story?: Story): string {
  const C = cap(b.short);
  return `# Implementation — ${story ? `${story.id} ${story.title}` : b.title}

${meta(b, 'CodingAgent', mode, story)}
## Files produced

${table(['File', 'Purpose', 'Lines'], [
  [`api/${C}Controller.java`, 'HTTP surface, authorisation, error mapping', '~150'],
  [`domain/${C}Service.java`, 'Orchestration and transaction boundary', '~120'],
  [`domain/policy/${C}Policy.java`, 'Business rules, pure', '~180'],
  [`persistence/${C}RepositoryImpl.java`, 'Queries and invariant translation', '~140'],
  [`persistence/migration/V1__init.sql`, 'Schema including the constraint', '~90'],
  [`worker/OutboxDispatcher.java`, 'At-least-once side-effect delivery', '~110'],
])}

---

## \`api/${C}Controller.java\`

\`\`\`java
package com.acme.${b.id}.api;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Validated
public class ${C}Controller {

    private final ${C}Service service;

    @PostMapping("${b.endpoints[1].p.replace('/api/v1', '')}")
    @PreAuthorize("hasAnyRole(${b.endpoints[1].role.split(',').map(r => `'${r.trim()}'`).join(', ')})")
    public ResponseEntity<${C}Response> create(
            @Valid @RequestBody ${C}Request body,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @AuthenticationPrincipal Jwt jwt) {

        // Authorities come from the verified token. Nothing in the request
        // contributes to an authorisation decision (ADR-003).
        var actor = Actor.from(jwt);
        var result = service.submit(body.toCommand(idempotencyKey), actor);

        return ResponseEntity
                .created(URI.create("${b.endpoints[1].p}/" + result.id()))
                .body(${C}Response.from(result));
    }

    @GetMapping("${b.endpoints[2].p.replace('/api/v1', '')}")
    public ${C}Response get(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        // Ownership is enforced in the repository query, not here, so a new
        // caller of the same repository cannot forget it.
        return service.findForActor(id, Actor.from(jwt))
                      .map(${C}Response::from)
                      .orElseThrow(() -> new ForbiddenException(id));
    }
}
\`\`\`

## \`domain/${C}Service.java\`

\`\`\`java
package com.acme.${b.id}.domain;

@Service
@RequiredArgsConstructor
@Slf4j
public class ${C}Service {

    private final ${C}Repository repository;
    private final ${C}Policy policy;
    private final OutboxWriter outbox;
    private final Clock clock;

    @Transactional
    public ${C}Result submit(${C}Command cmd, Actor actor) {
        var violations = policy.validate(cmd.toRequest(), Context.of(actor, clock));
        if (!violations.isEmpty()) {
            throw new RuleViolationException(violations);
        }

        try {
            var saved = repository.insert(cmd.toEntity(actor, clock.instant()));

            // Enqueued inside the transaction: if the write rolls back, the
            // notification goes with it. Dispatch happens after commit.
            outbox.enqueue(Notification.created(saved));

            log.info("${b.short} created id={} actor={}", saved.id(), actor.subjectId());
            return ${C}Result.of(saved);

        } catch (DataIntegrityViolationException e) {
            if (isInvariantViolation(e)) {
                // Expected under contention — not an error condition.
                throw new ConflictException(DomainCode.RESOURCE_UNAVAILABLE);
            }
            throw e;
        }
    }

    /** SQLSTATE 23P01 is the exclusion constraint from V1__init.sql. */
    private boolean isInvariantViolation(DataIntegrityViolationException e) {
        return e.getMostSpecificCause() instanceof SQLException sql
            && "23P01".equals(sql.getSQLState());
    }
}
\`\`\`

## \`domain/policy/${C}Policy.java\`

\`\`\`java
package com.acme.${b.id}.domain.policy;

/**
 * Business rules from REQ §3. Pure: no repository, no clock of its own, no
 * I/O. Returns every violation rather than throwing on the first, so the API
 * can report them all at once.
 */
@RequiredArgsConstructor
public final class ${C}Policy {

    private final ${C}Rules rules;

    public List<Violation> validate(${C}Request r, Context ctx) {
        return Stream.of(
${b.rules.slice(0, 5).map(x => `                check${x.id.replace('-', '')}(r, ctx)`).join(',\n')}
        ).flatMap(Optional::stream).toList();
    }

${b.rules.slice(0, 3).map(r => `    /** ${r.id} — ${r.text} */
    private Optional<Violation> check${r.id.replace('-', '')}(${C}Request r, Context ctx) {
        return ${r.id === b.rules[0].id ? 'Optional.empty()  // enforced by the schema; see V1__init.sql' : `r.satisfies${r.id.replace('-', '')}(rules)
             ? Optional.empty()
             : Optional.of(Violation.of("${r.id}", "${r.text.slice(0, 50)}…"))`};
    }`).join('\n\n')}
}
\`\`\`

## \`persistence/migration/V1__init.sql\`

\`\`\`sql
${schemaFor(b)}
\`\`\`

## \`worker/OutboxDispatcher.java\`

\`\`\`java
package com.acme.${b.id}.worker;

@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxDispatcher {

    private final OutboxRepository outbox;
    private final List<NotificationPort> ports;

    /**
     * At-least-once. Every port is idempotent on the outbox row id, so a
     * redelivery after a crash cannot produce a duplicate side effect.
     */
    @Scheduled(fixedDelayString = "\${${b.id}.outbox.interval:PT5S}")
    @Transactional
    public void dispatch() {
        for (var row : outbox.claimBatch(100)) {
            try {
                ports.forEach(p -> p.send(row.payload(), row.id()));
                outbox.markSent(row.id());
            } catch (Exception e) {
                // Never rethrow: one failing notification must not stop the
                // batch or affect any core operation.
                outbox.markFailed(row.id(), e.getMessage());
                log.warn("outbox dispatch failed id={} attempt={}", row.id(), row.attempts());
            }
        }
    }
}
\`\`\`

## Build verification

\`\`\`
$ ./mvnw -q clean verify

[INFO] ${C}PolicyTest ................................ 24 passed
[INFO] ${C}RepositoryIT .............................. 11 passed
[INFO] ${C}ConcurrencyIT ............................. 3 passed
[INFO] ${C}ServiceTest ............................... 17 passed
[INFO] ${C}ControllerTest ............................ 19 passed
[INFO] ${C}IdempotencyIT ............................. 6 passed
[INFO] ------------------------------------------------------------
[INFO] Tests run: 80, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
\`\`\`

## Handoff to Static Analysis

The implementation is complete and building. Known areas for the SCA agent to
examine: method length in the service layer, the duplicated boundary logic
between the policy and the query builder, and constants that were inlined
during implementation rather than bound to \`${C}Rules\`.`;
}

/* ------------------------------------------------------------------ 9 SCA */
export function sca(b: Brief, mode: Mode, story?: Story): string {
  const bySev = (s: string) => b.findings.filter(f => f.sev === s);
  return `# Static Code Analysis — ${story ? `${story.id} ${story.title}` : b.title}

${meta(b, 'StaticCodeAnalysisAgent', mode, story)}
## 1. Summary

${table(['Severity', 'Count', 'Action'], [
  ['🔴 High', String(bySev('High').length), 'Fix before merge'],
  ['🟡 Medium', String(bySev('Medium').length), 'Fix this iteration'],
  ['🟢 Low', String(bySev('Low').length), 'Backlog'],
])}

${table(['Metric', 'Value', 'Threshold', 'Status'], [
  ['Lines of code', '2,840', '—', '—'],
  ['Average cyclomatic complexity', '6.2', '< 8', '✅'],
  ['Max cyclomatic complexity', String(maxComplexity(b)), '< 12', '❌'],
  ['Duplicated blocks', String(bySev('High').filter(f => /duplic/i.test(f.kind)).length + 2), '0', '❌'],
  ['Test line coverage', '78%', '≥ 85%', '❌'],
  ['Public API documented', '91%', '≥ 90%', '✅'],
  ['Dependencies with known CVEs', '0', '0', '✅'],
])}

## 2. Findings

${b.findings.map((f, i) => `### SCA-${String(i + 1).padStart(3, '0')} — ${f.kind} ${f.sev === 'High' ? '🔴' : f.sev === 'Medium' ? '🟡' : '🟢'} ${f.sev}

**Location** \`${f.where}\`

**What** ${f.what}

**Why it matters** ${whyItMatters(f.kind)}

**Fix** ${f.fix}
`).join('\n')}

## 3. Complexity hotspots

${table(['Method', 'Complexity', 'Lines', 'Verdict'],
  b.findings.filter(f => /complexity/i.test(f.kind)).map(f => {
    const m = f.where.match(/complexity (\d+)/);
    return [`\`${f.where.split('—')[0].trim()}\``, m ? m[1] : '—', '~140', 'Refactor before merge'];
  }).concat([
    ['`OutboxDispatcher#dispatch`', '7', '~40', 'Acceptable'],
    ['`ProblemDetailHandler#handle`', '9', '~60', 'Acceptable — a switch over exception types'],
  ]))}

## 4. Duplication

The most consequential duplication is not the largest block, it is the one
where two copies **disagree**:

${b.findings.filter(f => /duplic/i.test(f.kind)).map(f => `> \`${f.where}\` — ${f.what}\n>\n> ${f.fix}`).join('\n\n')}

Identical duplication is a maintenance cost. Divergent duplication is a
defect that has already shipped.

## 5. Test coverage gaps

${table(['Package', 'Line', 'Branch', 'Gap'], [
  ['domain.policy', '96%', '89%', 'Boundary values on two rules are untested.'],
  ['domain', '81%', '68%', 'The conflict path is asserted once; the rollback of the outbox row is not.'],
  ['persistence', '74%', '61%', 'The invariant is tested; the authorisation-scoped queries are not.'],
  ['api', '88%', '72%', 'Two authorisation branches unexercised — see the SEC findings.'],
  ['worker', '52%', '40%', 'Retry and failure paths untested; this is where at-least-once breaks.'],
])}

Coverage percentage is the least interesting number here. The gap that matters
is \`worker\` — the retry path is the mechanism protecting every external
integration, and it is essentially untested.

## 6. Recommended order

1. **${b.findings[0].kind}** at \`${b.findings[0].where.split('—')[0].trim()}\` — highest risk, and it blocks the refactors below.
2. **${b.findings[1].kind}** at \`${b.findings[1].where.split('—')[0].trim()}\` — a live defect, not a smell.
3. Close the \`worker\` coverage gap before adding any further integration.
4. Extract configuration constants — cheap, and it makes the remaining findings easier to verify.

## 7. Handoff to Security

No injection or credential-handling issues are reported here; that surface
belongs to the SEC agent. The findings above that carry security weight and
should be re-examined there: the authorisation-scoped query coverage gap in §5,
and any place where a constant governing an authorisation decision was inlined.`;
}

const maxComplexity = (b: Brief) => {
  const m = b.findings.map(f => f.where.match(/complexity (\d+)/)).filter(Boolean).map(x => Number(x![1]));
  return m.length ? Math.max(...m) : 24;
};

const whyItMatters = (kind: string): string => {
  const k = kind.toLowerCase();
  if (k.includes('complexity')) return 'A method with this many branches cannot be exhaustively tested, and every future change to it risks a regression in an unrelated rule.';
  if (k.includes('duplic')) return 'Two implementations of one rule will drift. When they disagree, the system has two behaviours and no one knows which is correct.';
  if (k.includes('concurrency') || k.includes('race')) return 'It fails only under load, which means it fails in production and passes in review.';
  if (k.includes('null')) return 'A NullPointerException here surfaces as a 500 on a user-facing path.';
  if (k.includes('n+1')) return 'It passes with test data and collapses at production volume — this is directly the latency NFR.';
  if (k.includes('transaction')) return 'A partial commit leaves the system in a state the domain model says is impossible, and recovery is manual.';
  if (k.includes('idempot')) return 'A retry over a flaky network duplicates a real-world side effect.';
  if (k.includes('magic')) return 'Business rules that are not searchable cannot be audited or varied, and they get changed in one place out of five.';
  if (k.includes('dead')) return 'It implies a behaviour that does not exist, and readers plan around it.';
  if (k.includes('leak')) return 'It degrades over time and manifests after deployment, when the cause is hardest to attribute.';
  if (k.includes('derived')) return 'Two sources of truth for one number guarantees they eventually disagree.';
  if (k.includes('correctness') || k.includes('precision')) return 'Wrong figures that look plausible are worse than an outage — nobody notices until an audit.';
  if (k.includes('unbounded')) return 'A single request can exhaust the process; it is a self-inflicted denial of service.';
  if (k.includes('primitive')) return 'The type system is not being used to prevent a whole class of caller error.';
  if (k.includes('performance')) return 'It directly contradicts a stated non-functional requirement.';
  return 'It increases the cost of every future change to this area.';
};

/* ------------------------------------------------------------------ 10 SEC */
export function sec(b: Brief, mode: Mode, story?: Story): string {
  const crit = b.vulns.filter(v => v.sev === 'Critical');
  const high = b.vulns.filter(v => v.sev === 'High');
  return `# Security Analysis — ${story ? `${story.id} ${story.title}` : b.title}

${meta(b, 'SecurityAgent', mode, story)}
## 1. Executive summary

**${b.vulns.length} findings: ${crit.length} Critical, ${high.length} High, ${b.vulns.filter(v => v.sev === 'Medium').length} Medium, ${b.vulns.filter(v => v.sev === 'Low').length} Low.**

${crit.length > 0
  ? `🔴 **Release blocked.** ${crit.length} critical ${crit.length === 1 ? 'finding' : 'findings'} ${crit.length === 1 ? 'allows' : 'allow'} an authenticated caller to act outside their authority. ${crit[0].title} is exploitable with no special tooling.`
  : '🟡 No critical findings. The High findings below should be closed before release.'}

${table(['Severity', 'Count', 'CVSS range', 'Gate'], [
  ['🔴 Critical', String(crit.length), crit.length ? `${Math.min(...crit.map(v => v.cvss))}–${Math.max(...crit.map(v => v.cvss))}` : '—', 'Blocks release'],
  ['🟠 High', String(high.length), high.length ? `${Math.min(...high.map(v => v.cvss))}–${Math.max(...high.map(v => v.cvss))}` : '—', 'Blocks release'],
  ['🟡 Medium', String(b.vulns.filter(v => v.sev === 'Medium').length), '4.0–6.9', 'Fix this iteration'],
  ['🟢 Low', String(b.vulns.filter(v => v.sev === 'Low').length), '0.1–3.9', 'Backlog'],
])}

## 2. OWASP Top 10 (2021) coverage

${table(['Category', 'Findings', 'Status'], owaspRows(b))}

## 3. Findings

${b.vulns.map((v, i) => `### SEC-${String(i + 1).padStart(3, '0')} — ${v.title}

${table(['', ''], [
  ['**Severity**', `${v.sev === 'Critical' ? '🔴' : v.sev === 'High' ? '🟠' : v.sev === 'Medium' ? '🟡' : '🟢'} ${v.sev} (CVSS ${v.cvss})`],
  ['**CWE**', v.cwe],
  ['**OWASP**', v.owasp],
  ['**Location**', `\`${v.where}\``],
])}

**Impact.** ${v.fix.split('.')[0]}.

**Remediation.** ${v.fix}

**Verification.** ${verifyFor(v)}
`).join('\n')}

## 4. What is already correct

Not everything is a finding, and the review should say so:

- Identity is verified against the provider's JWKS rather than trusted from a header (ADR-003 held through implementation).
- The core invariant is enforced in the schema, so it cannot be bypassed by a second writer or regressed by a refactor.
- No secrets are committed; configuration is externalised.
- Dependencies carry no known CVEs at the scanned version set.
- Audit rows are written in the same transaction as the change they record, so an audit gap cannot be produced by a partial failure.

## 5. Remediation plan

${table(['Order', 'Finding', 'Severity', 'Effort', 'Blocks release'],
  b.vulns.map((v, i) => [String(i + 1), `SEC-${String(i + 1).padStart(3, '0')} ${v.title.slice(0, 44)}`, v.sev,
    v.sev === 'Critical' ? 'S' : v.sev === 'High' ? 'M' : 'S',
    v.sev === 'Critical' || v.sev === 'High' ? 'Yes' : 'No']))}

## 6. Regression tests required

Every finding above needs a test that fails against the current code. A fix
without a failing-first test will be reintroduced.

\`\`\`java
@Test
void a_caller_cannot_act_on_another_subjects_resource() {
    var mine = givenAResourceOwnedBy(subjectA);
    assertThatThrownBy(() -> service.actOn(mine.id(), subjectB))
        .isInstanceOf(ForbiddenException.class);
}

@Test
void role_is_derived_from_the_verified_token_not_from_a_header() {
    mvc.perform(post("/api/v1/privileged")
            .header("X-Role", "ADMIN")                 // attacker-supplied
            .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_USER"))))
       .andExpect(status().isForbidden());
}
\`\`\`

## 7. Sign-off

${crit.length > 0 || high.length > 0
  ? `**Not approved for release.** ${crit.length + high.length} findings at High or above must be closed and verified. Re-run this stage after remediation.`
  : '**Approved for release** subject to the Medium findings being scheduled.'}

This is the final stage of the line. On approval the engineering record for
**${b.title}** is complete: requirement, solution, design, stories, scenarios,
low-level specification, tests, implementation, static analysis and this
security review.`;
}

function owaspRows(b: Brief): string[][] {
  const cats = [
    'A01:2021 Broken Access Control', 'A02:2021 Cryptographic Failures',
    'A03:2021 Injection', 'A04:2021 Insecure Design',
    'A05:2021 Security Misconfiguration', 'A06:2021 Vulnerable Components',
    'A07:2021 Auth Failures', 'A08:2021 Data Integrity Failures',
    'A09:2021 Logging Failures', 'A10:2021 SSRF',
  ];
  return cats.map(c => {
    const hits = b.vulns.filter(v => v.owasp === c);
    return [c, hits.length ? hits.map((_, i) => `SEC-${String(b.vulns.indexOf(hits[i]) + 1).padStart(3, '0')}`).join(', ') : '—',
      hits.length ? (hits.some(h => h.sev === 'Critical') ? '🔴 Critical' : hits.some(h => h.sev === 'High') ? '🟠 High' : '🟡 Medium') : '✅ Clear'];
  });
}

const verifyFor = (v: Vuln0): string => {
  const t = v.title.toLowerCase();
  if (t.includes('idor') || t.includes('cross-tenant') || t.includes('access')) return 'Authenticate as subject A, attempt the operation against a resource owned by subject B, assert 403. Repeat for every mutating endpoint.';
  if (t.includes('rate')) return 'Issue requests above the configured budget and assert 429 with Retry-After set.';
  if (t.includes('signature') || t.includes('webhook')) return 'Post a payload with an invalid signature and assert it is rejected without side effect.';
  if (t.includes('log')) return 'Run the flow and grep the captured log output for the sensitive field; assert no match.';
  if (t.includes('injection') || t.includes('sql')) return 'Submit a payload containing the metacharacter and assert it is treated as data, not syntax.';
  if (t.includes('csv') || t.includes('formula')) return 'Export a record whose name begins with = and assert the cell is prefixed and quoted.';
  if (t.includes('random')) return 'Assert the token source is SecureRandom and that 10,000 generated tokens contain no collision.';
  if (t.includes('unauthenticated') || t.includes('mtls')) return 'Call the endpoint without a client certificate and assert the connection is refused.';
  if (t.includes('unbounded') || t.includes('exhaustion')) return 'Request the maximum range and assert a 400 rather than a timeout.';
  if (t.includes('stack trace') || t.includes('leaked')) return 'Force the error and assert the response body contains a correlation id and no framework text.';
  return 'Add a test that reproduces the finding and fails against the current implementation.';
};
type Vuln0 = { title: string };

/* ------------------------------------------------------------------ util */
function cap(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
          .replace(/^./, c => c.toUpperCase());
}
function camel(s: string): string {
  const c = cap(s);
  return c.charAt(0).toLowerCase() + c.slice(1);
}

/* ------------------------------------------------------------------ index */
export const RENDERERS: Record<number, (b: Brief, m: Mode, s?: Story) => string> = {
  1: req, 2: hls, 3: hld, 4: us,
  5: tr, 6: lld, 7: tdd, 8: code, 9: sca, 10: sec,
};

/** Stages 5–10 are story-scoped in per-story mode. */
export const STORY_SCOPED = new Set([5, 6, 7, 8, 9, 10]);

export function renderAgent(b: Brief, stage: number, mode: Mode, story?: Story): string {
  const fn = RENDERERS[stage];
  if (!fn) return '';
  const scoped = mode === 'per-story' && STORY_SCOPED.has(stage) ? story : undefined;
  return fn(b, mode, scoped);
}
