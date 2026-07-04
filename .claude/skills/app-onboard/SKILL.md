# Application Onboarding (`/app-onboard`) — Reverse-Engineer an App into the Process Graph

Take an **existing application** (any stack, local path or git URL) and
reverse-engineer it — through its **data model, API layer, event structure,
and business logic** — into the definition of the **business process it
implements**, expressed in companygraph's vocabulary (Domain / UserJourney /
Activity / Role / System / Location + the six core edge types + `systemKind`
augmentation classification). The result is imported into the graph so the
application's process is managed inside companygraph like any other.

This is the layer that turns companygraph from "model your business by hand"
into "onboard what you already run". It reuses the house automation: the
`app-archaeologist` agent for extraction, the Workflow engine for the fan-out,
`/api/v1/import`'s upsert semantics for the (idempotent) landing, and the
same human-gates-at-the-edges doctrine as `/spec-app` and `/design-apply`.

## Commands

| Command | Purpose | Mutates |
|---|---|---|
| `/app-onboard <path-or-git-url> [--name <slug>]` | Full pipeline: scope → extract → synthesize → validate → review gate → import | graph (only after the gate) |
| `/app-onboard <target> --analyze-only` | Stop after the dossier + validated import payload; no import | `.claude/onboarding/<slug>/` only |
| `/app-onboard import <slug>` | Import a previously analyzed app (dossier already reviewed) | graph |
| `/app-onboard status [slug]` | Show onboarded apps + their manifest state | nothing |
| `/app-onboard refresh <slug>` | Re-run extraction against the (updated) app, diff vs the manifest, report process drift | `.claude/onboarding/<slug>/` |

## Artifacts

```
.claude/onboarding/<app-slug>/
├── manifest.json     # target, commit analyzed, counts, import state, run history
├── dossier.md        # the reverse-engineering dossier (template below)
├── import.json       # idempotent import payload (deterministic ids)
├── checks/           # validation scratch scripts (throwaway, committed ok)
└── runs/<ISO-ts>.md  # run log per invocation (always written, even on failure)
```

| Resource | Location |
|----------|----------|
| Extractor agent | `.claude/agents/app-archaeologist.md` |
| Fan-out workflow | `.claude/workflows/app-onboard.js` |
| Dossier template | `.claude/skills/app-onboard/templates/dossier.md` |
| Vocabulary (law) | `shared/src/schema/nodes.ts`, `shared/src/schema/edges.ts` (EDGE_ENDPOINTS) |
| Import format | `shared/seed/retail-mini.json` (nodes/edges upsert payload) |
| Import endpoint | `POST /api/v1/import` (MERGE-on-id, per graph-core §4) |

---

## Mapping doctrine (the heart of the skill)

The four analysis surfaces map to the process graph like this. Every mapping
carries **evidence (file:line)** and a **confidence tier** (`confirmed` /
`inferred` / `assumed`); anything `assumed` MUST surface at the review gate.

| App evidence | companygraph meaning |
|---|---|
| Aggregate clusters in the data model (FK ownership, module boundaries, schemas) | Candidate **Domains** |
| Status/state enums + their legal transitions; sagas; workflow tables | **UserJourney** boundaries + **PRECEDES** ordering of activities |
| Write endpoints / commands / mutations (API layer) | **Activities** (business actions); reads are supporting detail, not activities |
| Resource + call-sequence grouping; UI flows behind the API | Grouping of activities into **UserJourneys** (each `PART_OF` exactly one Domain) |
| Auth roles, scopes, permission checks, approval chains | **Roles** + **EXECUTES** edges (approval chains = distinct roles per step) |
| The application itself; every external SaaS/SDK/API it calls | **System** nodes + **USES_SYSTEM** (activity→system) and **INTEGRATES_WITH** (system→system) |
| What each system does to the work: CRUD/transactional vs autonomous decision loops vs ML scoring/forecasting | `systemKind` = `functional` \| `agentic` \| `ai_predictive` (XD-15 vocabulary — REQUIRED on every System node) |
| Producer→consumer event pairs, queues, webhooks, cron | **PRECEDES** evidence across activities; **INTEGRATES_WITH** across systems; scheduled Activities |
| Event rates, SLAs/timeouts, counters, alert thresholds in the code | **KPI candidates** (listed in the dossier; NOT auto-created — KPI creation goes through the governed KPI surface after the gate) |
| Deployment regions/sites/stores in infra manifests | **Locations** + **AT_LOCATION** (optional — only when the business actually varies by site) |

**Identity rule (idempotency):** every node/edge id is a deterministic
UUIDv7-shaped id derived from `<app-slug>:<label-or-type>:<name>` (hash into
the low bits, fixed timestamp prefix, version nibble `7`, variant `8` — the
`retail-mini.json` pattern). Re-running `/app-onboard` on the same app
**upserts** instead of duplicating. Never use random ids.

**Provenance rule:** every imported node carries
`attributes: { source: "<app-slug>", evidence: [...], confidence: "..." }`
so the graph can always answer "why does companygraph believe this?".

---

## The pipeline

### Phase 0 — Scope (you, the orchestrator)

1. Resolve the target: absolute local path, or `git clone --depth 1` a URL
   into the session scratchpad (never into the companygraph repo).
2. Detect the stack (languages, frameworks, service count) and inventory the
   six surfaces (data-model, api-surface, events, business-logic,
   actors-permissions, integrations-deployment) — cheap Glob/head-count level.
3. Derive `<app-slug>` (from `--name` or the repo name), create
   `.claude/onboarding/<app-slug>/`, record target + commit SHA in
   `manifest.json`.
4. Present scope: stack, size, surfaces found/absent, expected cost (7–8
   agents). **GATE (lightweight):** confirm scope + slug before extraction.
   Skip the ask when the user already named the target unambiguously and the
   scope holds no surprises.

### Phase 1–3 — Extract → Synthesize → Validate (the workflow)

Launch `.claude/workflows/app-onboard.js` with
`{ app, path, outDir }` (inline the consts into the script body if named-args
propagation fails — same fallback as `/spec-app`). The workflow:

- fans out **six parallel `app-archaeologist` extractors** (one per surface,
  structured findings with evidence + confidence),
- runs **one synthesis agent** over all findings → writes `dossier.md` +
  `import.json` per the mapping doctrine above,
- runs **one adversarial validation agent** → parses the payload, checks every
  edge against `EDGE_ENDPOINTS`, id determinism/shape, PRECEDES acyclicity,
  Activity/Journey/Domain containment, `systemKind` presence, and that every
  `assumed` mapping surfaces in the dossier's open questions. `verdict: fail`
  blocks the review gate — fix and re-run (resume the workflow; extraction
  results are cached).

### Phase 4 — Review gate (human, REQUIRED before any import)

Present the dossier: the proposed process model (domains → journeys → ordered
activities → roles/systems/locations), the `systemKind` classifications, KPI
candidates, and **every open question + assumed mapping**. Resolve ambiguities
via `AskUserQuestion` rounds (≤4 per round — journey boundaries, role naming,
systemKind calls the evidence couldn't settle). Apply the answers to
`import.json` + dossier. **GATE:** the user approves the model before import.
`--analyze-only` stops here.

### Phase 5 — Import & verify

1. Stack must be up (`bun run dev`); dev-mode auth note: with
   `ONELOGIN_ISSUER` unset the loopback API grants the dev session — fine
   locally, never onboard against a non-local deployment.
2. `POST /api/v1/import` with `import.json` (upsert). Two-phase
   collect-and-continue: row-level failures land in `errors[]` — surface every
   one; zero-imported is a failure, not a success.
3. Verify: `/api/v1/stats` deltas match the manifest counts; spot-query the
   app's System node (must carry `systemKind`); journeys resolve in the
   explorer (`#/explorer/domains` → drill to an onboarded journey).
4. Update `manifest.json` (imported_at, counts, stats delta) + write the run
   log. Report with deep links into the explorer.
5. Offer follow-ups (do not auto-run): register the app as a BusinessModel /
   generate stories via the studio (once `model-workspace-core` +
   `story-spec-core` are live); attach KPI candidates through the governed KPI
   surface; classify deeper augmentation via `#/exec/control`.

### `refresh <slug>` — drift detection

Re-run Phase 1 extraction against the updated target, re-synthesize into
`import.next.json`, and diff against the manifest's imported model: added /
removed / renamed activities, changed orderings, new integrations. Report the
drift; the user decides whether to re-import (upsert makes it safe) or amend
by hand. Never auto-import on refresh.

---

## Operating rules

- **The review gate is never self-approved.** House rule, verbatim from
  `/design-apply`: green validation is necessary, not sufficient — a human
  approves the process model before it enters the graph.
- **Read-only toward the target app.** Extractors never modify the analyzed
  codebase; the conductor clones URLs into the scratchpad only.
- **Idempotent by construction.** Deterministic ids + upsert import; running
  twice must be a no-op, not a duplicate graph.
- **Evidence or it didn't happen.** No node/edge without provenance
  attributes; no `assumed` mapping without a review-gate question.
- **Vocabulary is law.** Labels/edge types come from the schema registries
  (runtime-registry additions need the ontology surface + a note in the
  dossier — never invent labels in the payload silently). `systemKind` is
  required on every System node (XD-15).
- **KPIs are proposed, never auto-created.** The governed KPI surface owns
  KPI writes; the dossier lists candidates with evidence.
- **Every run writes a run log**, success or failure (`runs/<ISO-ts>.md`).
- **Be honest about scale.** A large monorepo target means slow extraction —
  say so at the scope gate; offer `--analyze-only` first for big targets.
