# Feature Architecture Review

Comprehensive, opinionated audit of one feature against this codebase's hard-won well-architected practices. Read-only. Produces a single scorecard report.

## Usage

- `/review-feature <name>` — full audit. `<name>` can be a feature folder name, a spec dir under `.claude/specs/`, a backlog item id, or a free-text user story.
- `/review-feature <name> --pillar <pillar>` — single-pillar drill-down (faster).
- `/review-feature <name> --quick` — footprint + top-3 findings only, no full scorecard.

Pillar shorthands: `patterns` `reliability` `security` `observability` `data` `tests` `boundary` `pwa` `docs` `config`.

## Canonical reference

The "well-architected practices" for this codebase are NOT a generic framework — they live in:

1. **`.claude/patterns/*.md`** — every shape (memory module, scheduler job, registry, RPC method, subagent, PWA view, migration, test harness, …). The pattern file is the spec; deviations need a justification.
2. **`.claude/CLAUDE.md`** — invariants, protocols, and contracts (broadcaster ACL, three-tier Claude fallback, scheduler reliability wrapper, deploy guard, callback-prefix collisions, …).
3. **`.claude/specs/<feature>/`** — if the feature has a spec, the requirements + design + tasks are part of the contract.

Re-read `.claude/patterns/README.md` and the relevant pattern files at the START of every review. They evolve.

## Execution protocol

### Phase 1 — Map the footprint (parallel)

Discover everything the feature touches. Use parallel `Glob`/`Grep` and one `Read` of CLAUDE.md. Build the inventory:

- **Telegram actions** — `actions/<feature>*.ts` and grep for the `/<command>` it owns
- **Scheduler jobs** — grep `cloud/scheduler-jobs/**` and `JOB_METADATA` for the feature's job names
- **Memory modules + tables** — `memory/<feature>*.ts`, schema migrations referencing it, `dimensions.ts` entry
- **RPC methods** — grep `local/agent.ts` for handlers, classification in queueable list
- **REST routes + middleware** — `webapp/routes/<feature>*.ts`, `ROUTE_MAP` entries in `middleware/auth.ts`, `router.ts` `registerRoute()` calls
- **WebSocket broadcasters** — `broadcastToAdmins` / `broadcastForTask` / `broadcastChatToAll` usage
- **PWA view** — `pwa/views/<feature>.js`, `components/`, service-worker precache entries, CloudFront `ordered_cache_behavior` in `terraform/main.tf` for any new path prefix
- **Subagent** — `subagents/agents/<feature>.ts` and `tools/schemas/`
- **Patterns referenced** — pattern files this feature should follow (memory-module / scheduler-job / pwa-view / registry / etc.)
- **Spec** — `.claude/specs/<feature>/{requirements,design,tasks}.md` + status

Print the footprint upfront so the rest of the review is grounded.

### Phase 2 — Score against the 10 pillars

For each pillar, mark **✅ pass / ⚠️ partial / ❌ fail / N/A**, with a one-line justification and file:line references. The pillar checks are below — they're the litmus tests, not exhaustive.

#### 1. Pattern compliance
- [ ] For each footprint area, the corresponding `.claude/patterns/*.md` was followed (memory module → lazy init + migration; scheduler job → `markRun()` BEFORE work; registry → coverage test; PWA view → vanilla JS no build; …).
- [ ] Deviations are documented in-code (comment explaining why) or in the spec.
- [ ] No reinvention of an existing pattern under a new name.

#### 2. Reliability
- [ ] Scheduler jobs wrapped in `withSchedulerRecovery()` (failure tracking + backoff + circuit breaker + DLQ).
- [ ] `markRun()` called BEFORE work, not only on success.
- [ ] Blocking-reason types use the right kind: `dependency` (auto), `human_required`, `waiting_external` with **`auto_resolvable=true`**, `failed_subtask`, `planning_failed`. Missing `auto_resolvable=true` is a foot-gun.
- [ ] External calls have timeouts (osascript `timeout: 15_000`+, `Bun.serve idleTimeout: 30`, IMAP per-message 5s, etc.).
- [ ] Idempotency: re-running the same job/RPC twice produces the same effect — no double-charge / double-send / double-write.
- [ ] Three-tier Claude fallback respected if the feature uses Claude reasoning (local CLI → EC2 CLI → API).
- [ ] Startup recovery: process restart re-queues in-flight work (no zombie subtasks).
- [ ] Failure-mode tests exist for the obvious failure paths (network down, agent offline, DB locked, timeout).

#### 3. Security & access control
- [ ] Any new `/api/<family>` route has a ROUTE_MAP entry in `middleware/auth.ts` (or is intentionally in `ALLOW_LIST` of both `route-map-coverage.test.ts` AND `route-map-completeness.test.ts` with a justification).
- [ ] Broadcasters chosen correctly: `broadcastToAdmins` for system events, `broadcastForTask(nodeId, …)` for per-task data, `broadcastChatToAll` only for benign cascade signals.
- [ ] Per-task ACL enforced server-side where applicable (collaborator level ≥ `participate` for sends).
- [ ] No secrets in code, comments, tests (other than fixtures with `DEADBEEF`/`<REDACTED>`/`example` markers).
- [ ] Audit log emitted for security-sensitive operations (auth, ACL grants, force operations).
- [ ] Admin-only endpoints gated by `auth.ts:isAdmin` middleware, not domain.
- [ ] Inputs from external sources (Telegram messages, REST bodies, WhatsApp webhooks) are validated before use in SQL / shell / file paths.

#### 4. Observability
- [ ] Structured `log.info/warn/error` with module + actionable fields, never bare `console.log`.
- [ ] Failures surface to the user via `notify()` (channel-respecting), NOT a hardcoded `sendTelegramDirect()`.
- [ ] Metrics counters for failure-rate-worth events (e.g., `ws_broadcast_acl_denied_total{event_type, reason}`).
- [ ] If the feature is in the scheduler, it appears on `/api/scheduler/health` automatically via `withSchedulerRecovery()`.
- [ ] User-visible errors are typed (`reminders_not_authorized`, `agent_offline`) — not raw exception strings — so PWA can render appropriate cards.

#### 5. Data layer
- [ ] New tables registered in a numbered migration in `memory/migrate.ts` with the correct `MAX(schema_version)` bump (verify with `PRAGMA table_info`, not `SELECT MAX`).
- [ ] FK constraints with explicit `ON DELETE` semantics; `PRAGMA foreign_keys=ON` is on for the SQLite singleton.
- [ ] Transactions wrap multi-statement writes that must be atomic.
- [ ] Retention/archive job exists if the table grows monotonically (counter, log, history).
- [ ] Indexes on the lookup columns the feature actually queries (not blanket).
- [ ] Soft-delete + hard-purge separation if applicable (per `reminders` 4-pass retention).
- [ ] Module exports are lazy-initialized — first call triggers schema, not module load.

#### 6. Test coverage
- [ ] Colocated test file (`<file>.test.ts` or `__tests__/<file>.test.ts`).
- [ ] Registry-coverage test where the feature introduces a registry (job registry, route registry, RPC registry, callback registry). Two recent CI failures came from missing JOB_METADATA + ROUTE_MAP entries.
- [ ] Tests use `tests/.skip.json` discipline — no `.skip()` inline without justification.
- [ ] Test DB isolation per `test-db-isolation.md`; no shared global DB across tests.
- [ ] Module-reset registry per `test-module-reset.md` if the feature has singleton state.
- [ ] Failure-path tests, not just happy-path.

#### 7. Cloud/local boundary
- [ ] New RPC method registered in `local/agent.ts`, listed in `methods` export.
- [ ] Classified correctly as queueable (idempotent, replayable: focus, layout, run_task) vs non-queueable (stale-on-replay: status, mail).
- [ ] Action-queue support if the operation must persist across agent disconnects.
- [ ] Timeouts per category match the operation (mail: 30–120s; claude_execute: 300s; default: 60s).
- [ ] Heartbeat/handshake unaffected — no top-level side-effects in modules imported by `agent.ts` (use `import.meta.main` guard).

#### 8. PWA + CloudFront
- [ ] Any new path prefix the PWA hits has an `ordered_cache_behavior` in `terraform/main.tf`. Without it, requests fall through to S3 SPA fallback (`index.html`) — silent breakage.
- [ ] New static-asset files added to `sw.js` `PRECACHE_URLS`. `CACHE_NAME` is the build-time placeholder `%%CACHE_VERSION%%` substituted by CI on every deploy — hand-bumping is a smell; missing PRECACHE entries is the real failure mode.
- [ ] New PWA UI scenario: catalog row added in `pwa/components/CATALOG.md` (or an existing default reused). Hand-rolled markup duplicating a catalog row is drift.
- [ ] Third-party proxy paths either served under `/api/*` or explicitly excluded from SW caching.
- [ ] `views/<feature>.js` follows pwa-view pattern (no build step, classic script tag).
- [ ] Cookie `Path` rewriting applied to proxy responses if the proxy serves at a non-root path.

#### 9. Documentation & spec drift
- [ ] If cross-cutting, CLAUDE.md mentions the feature (without duplicating contents — pointer is fine).
- [ ] Spec under `.claude/specs/<feature>/` has a clear status (active / shipped / archived).
- [ ] Spec is not >30 days stale relative to the code, OR has been actively touched.
- [ ] Superseded specs moved to `.claude/specs/archive/` rather than left dangling.
- [ ] Outdated pattern files updated, not just new ones piled on.

#### 10. Configurability & kill-switch
- [ ] User-visible behavior has a `user_settings` toggle if it should be opt-out (e.g., `notification_channel`, `opt_improvement_enabled`).
- [ ] Schedulable jobs are disabled-toggleable from `/scheduler` UI.
- [ ] Risky/expensive features have a kill-switch documented somewhere a human can find under stress.

### Phase 3 — Findings, severity-ordered

Group findings into:

- **🔴 Critical** — invariant violation, security gap, data-loss risk, no-rollback path. Block deploy.
- **🟡 Warning** — pattern drift, missing test, observability hole, foot-gun left for future-you. Schedule a fix.
- **🔵 Suggestion** — refactor opportunity, doc gap, minor inconsistency. Backlog.

Each finding cites `path:line` and proposes a concrete fix (one sentence, sometimes a code snippet).

### Phase 4 — Drift signals (cheap meta-checks)

- Spec mtime vs code mtime — flag specs untouched since the code last changed substantially.
- Tests in `tests/.skip.json` referencing this feature with no expiry note.
- Pattern files older than 90 days that the feature relies on (might need refresh).
- Open backlog items tagged with this feature stuck in the same status >14d.

### Phase 5 — Write the report

Single file at `~/.claude-relay/feature-review-<feature>-YYYY-MM-DD.md` with this structure:

```
# Feature Review: <feature>
Date: <UTC>  |  Reviewer: review-feature@<git-sha>

## Footprint
<inventory bullet list from Phase 1>

## Scorecard
| Pillar | Status | Notes |
| --- | --- | --- |
| 1. Pattern compliance | ✅/⚠️/❌/N/A | <one line> |
| 2. Reliability | ... | ... |
| ...

## Findings

### 🔴 Critical
- **<title>** — <file:line>. <one-paragraph fix>.

### 🟡 Warning
...

### 🔵 Suggestion
...

## Drift signals
- ...

## Recommended next actions (ranked)
1. ...
2. ...
```

Print the path of the written report at the end. Do NOT take any actions beyond writing the report.

## Safety rules

- **Read-only.** No `Edit`/`Write` against source. The only file written is the report under `~/.claude-relay/`.
- **No assumptions.** If the feature footprint is unclear from `<name>`, ask before scanning.
- **No inflated severity.** Critical means deploy-blocker. Warning means schedule-it-soon. If everything is critical, nothing is.
- **No generic advice.** Findings cite this codebase's actual file paths, patterns, and invariants — not "consider adding error handling" platitudes.
- **Don't re-derive what's already documented.** If a deviation is justified in a spec or comment, note that and move on; don't re-litigate decisions.

## What this skill is NOT

- Not `/review` — that's PR-diff review.
- Not `/spec` — that's new-feature design.
- Not `/security-review` — narrower-scoped pre-merge security pass.
- Not `/ultrareview` — heavier, multi-agent cloud review billed separately.

This skill is for: "is feature X well-architected as it stands today against this codebase's accumulated discipline?"
