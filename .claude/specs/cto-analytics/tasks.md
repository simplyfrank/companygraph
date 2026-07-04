---
feature: "cto-analytics"
created: "2026-07-04"
author: "spec-author (as-built reconciliation)"
status: "approved"
revision: 2
reviewing_requirements_revision: 2
reviewing_design_revision: 2
size: "medium"
total_tasks: 21
---

# Tasks: cto-analytics (reconciliation + remaining scope)

## Reading guide

Two kinds of tasks, modeled on `_baseline/tasks.md`:

- **T-01..T-06 — Ratify (as-built)**: confirm surfaces that already exist
  (built off-spec, adopted 2026-07-04 via `_baseline`). Nothing to implement;
  each verifies the as-built artifact against reality. Ratify tasks close an
  AC only where the AC is genuinely met (or superseded); partial builds
  *advance* an AC and the closing pending task is named.
- **T-07..T-21 — Pending (open scope)**: normal build tasks for the unbuilt
  FRs. Their Verification entries name the test files the requirements'
  AC table prescribes — those files do **not** exist yet and are created by
  the task ("planned"). Pending tasks are gated on design review + the §10
  Open Questions (OQ-*) named per task.
- **Order**: ratify tasks first (no dependencies); pending tasks
  top-to-bottom with explicit `Blocked by`. T-19..T-21 were split out in
  revision 2 (design-review pass-1 C-05, 3-file cap) — existing task ids are
  never renumbered.

Revision 2 absorbs the design-review pass-1 findings that land in tasks:
**C-03** (AC-10 closure moved from T-14 to T-18; T-16/T-18 extend the
envelope test), **C-04** (Native Conflicts suppressions assigned to
T-07/T-08/T-13/T-17), **C-05** (T-14 → T-14+T-19; T-07 → T-07+T-20+T-21),
plus the B-01/C-01 consequences (T-13's defaults gated on design OQ-4a;
T-07/T-21 own the AC-01 accent ramp in
`pwa/src/styles/companygraph/tokens.css` per design §2 Pin-4).

## Task list — ratification (as-built)

### T-01 — Ratify analytics surface shell + Overview tab

- **Files** (4): `pwa/src/views/analytics/Overview.tsx`, `pwa/src/views/analytics/Overview.module.css`, `pwa/src/route.ts` (analytics surface rows), `pwa/src/views/index.tsx` (VIEWS.analytics)
- **Implements**: DD-05, DD-06 (adjacent surface — no FR of this spec; governed by `_baseline` FR-14 / its AC-13)
- **Closes**: — (no AC of this spec)
- **Complexity**: simple (ratify only)
- **Verification**: `pwa/src/__tests__/error-scenarios/analytics/overview/network/analytics-overview-network-stats_loading_failure.test.tsx` + `pwa/src/__tests__/error-scenarios/analytics/overview/data/analytics-overview-data-metrics_calculation_failure.test.tsx` (both exist, run under vitest)

### T-02 — Ratify domain↔system matrix view (as-built variant of FR-02)

- **Files** (2): `pwa/src/views/analytics/Matrix.tsx`, `pwa/src/views/analytics/Matrix.module.css`
- **Implements**: FR-02 (partial — heatmap + totals only), DD-01, DD-08
- **Closes**: — ; **advances AC-02** (cell deep-links, virtualisation, filters outstanding → T-08)
- **Complexity**: simple (ratify only)
- **Verification**: manual: with the stack up (`bun run dev`), open `#/analytics/matrix` in macOS Chrome (mouse) — expect a domain×system heatmap with accent-shaded counts plus two horizontal-bar usage charts, and no console errors

### T-03 — Ratify complexity proxy view (as-built variant of FR-04)

- **Files** (2): `pwa/src/views/analytics/Complexity.tsx`, `pwa/src/views/analytics/Complexity.module.css`
- **Implements**: FR-04 (partial variant — proxy `activities + fanOut + fanIn`, DD-04), DD-01
- **Closes**: — ; **advances AC-04** (real formula, hover sub-scores, tunable weights outstanding → T-10)
- **Complexity**: simple (ratify only)
- **Verification**: manual: open `#/analytics/complexity` in macOS Chrome (mouse) — expect a per-journey table (activities / fan-out / fan-in / score pill) and a 4-bucket complexity histogram, no console errors

### T-04 — Ratify AI-candidates static placeholder (FR-07 stub)

- **Files** (2): `pwa/src/views/analytics/Ai.tsx`, `pwa/src/views/analytics/Ai.module.css`
- **Implements**: FR-07 (placeholder only — hardcoded samples, self-labelled "static preview"; no filter, no CSV, no empty state)
- **Closes**: — (AC-07 and AC-15 remain fully open → T-13; scope framing goes to design OQ-4)
- **Complexity**: simple (ratify only)
- **Verification**: manual: open `#/analytics/ai` in macOS Chrome (mouse) — expect the two hardcoded sample cards and the "Live recommendations — wired by cto-analytics" grey block, confirming the tab is a placeholder, not a live filter

### T-05 — Ratify server-side graph analytics + stats endpoints (as-built)

- **Files** (3): `api/src/routes/analytics.ts`, `api/src/ontology/analytics/graph.ts`, `api/src/routes/stats.ts`
- **Implements**: FR-09 (partial — `GET /api/v1/analytics/graph` only; none of the 8 FR-09 report paths), DD-02, DD-03
- **Closes**: — (AC-10/AC-11/AC-12 remain open → T-14; the engine's direct `getDriver()` use is design OQ-1)
- **Complexity**: simple (ratify only)
- **Verification**: `api/__tests__/stats.integration.test.ts` (exists); plus manual: with the stack up and an authenticated session, `curl 127.0.0.1:8787/api/v1/analytics/graph` — expect a 200 JSON envelope containing `nodeCount`, `edgeCount`, `cycles`, `communities`, `pagerank`, `bottlenecks` keys

### T-06 — Record supersession of the no-auth invariant (NFR-06 / AC-14)

- **Files** (0): record-only — no source change (touching `pwa/src/__tests__/no-auth-grep.test.ts` belongs to the auth backfill spec)
- **Implements**: DD-07. NFR-06 inherited graph-core's NFR-08 / AC-22 no-auth rule; `_baseline` DD-02/DD-07 (adopted 2026-07-04) retired that rule and deleted `api/__tests__/no-auth-grep.test.ts`. Analytics routes now sit behind the central OAuth/RBAC router gate.
- **Closes**: AC-14 — **closed-as-superseded** (the criterion is no longer valid post-adoption; graph-core/AC-22 lineage retired)
- **Complexity**: simple
- **Verification**: manual: run `ls api/__tests__/no-auth-grep.test.ts` — expect "No such file or directory"; run `bun test api/__tests__/auth-oauth.test.ts` — expect pass (auth is the governed capability replacing the invariant)

## Task list — pending (open scope; gated on design review + OQ answers)

### T-07 — System map view (FR-01)

*(Split in revision 2 per review C-05: server metrics module → T-20; accent
ramp tokens + tab registration → T-21.)*

- **Files** (3): `pwa/src/views/analytics/Systems.tsx` (new), `pwa/src/views/analytics/Systems.module.css` (new), `pwa/src/__tests__/analytics-system-map.test.tsx` (new — the AC-01 ramp assertion)
- **Implements**: FR-01 — force-directed `System`/`INTEGRATES_WITH` map, degree centrality + integration count per system (data from T-20's endpoint), cluster coloring from T-21's 5-stop accent ramp. Owns the FR-01 Native Conflicts suppressions (Resolves: C-04): `touch-action: none` on the map container, the analytics-route-scoped `user-scalable=no` viewport meta, and the custom double-tap "fit to view" handler.
- **Closes**: AC-01 — recipe per design §2 Pin-4 (Resolves: C-01): ramp stops asserted against `pwa/src/styles/companygraph/tokens.css` custom properties, **not** the nonexistent `pwa/src/theme.ts`
- **Complexity**: complex
- **Blocked by**: design review; OQ-1, OQ-3; T-20 (metrics endpoint), T-21 (ramp tokens + registration)
- **Verification**: `pwa/src/__tests__/analytics-system-map.test.tsx` (planned — asserts every cluster fill resolves to one of the five `--accent-*` ramp stops in `tokens.css`; requirements' `pwa/__tests__/` path updated to the actual `pwa/src/__tests__/` layout) + manual on iPad Safari (touch): open `#/analytics/systems`, expect 6 system nodes per `retail-mini` seed; pinch-zoom zooms the canvas, not the page

### T-08 — Matrix completion: deep-links, virtualisation, filters (FR-02 full)

- **Files** (2): `pwa/src/views/analytics/Matrix.tsx` (modify), `pwa/src/views/analytics/Matrix.module.css` (modify)
- **Implements**: FR-02 — cell links to `#/explorer/activities?system_id=:sid&domain_id=:did` (binding param names per design §2 Open-3), virtualised grid, domain/system pre-filters. Owns the FR-02 Native Conflicts suppressions (Resolves: C-04): matrix scroll container ignores initial touches within 20 px of the viewport's left edge (iOS Safari back-gesture precedence) + `overscroll-behavior-y: contain` on the analytics-route body.
- **Closes**: AC-02
- **Complexity**: moderate
- **Blocked by**: design review; OQ-3 (route naming)
- **Verification**: `pwa/src/__tests__/analytics-matrix.test.tsx` (planned — click a cell, assert explorer filter URL carries `system_id` + `domain_id`)

### T-09 — Consolidation candidates panel (FR-03)

- **Files** (3): `api/src/analytics/consolidation.ts` (new), `pwa/src/views/analytics/Consolidation.tsx` (new), route registration
- **Implements**: FR-03 — activities with ≥ 2 `USES_SYSTEM` edges sorted DESC, with systems + parent journey + deep-link
- **Closes**: AC-03
- **Complexity**: moderate
- **Blocked by**: T-14 (endpoint scaffold)
- **Verification**: `api/__tests__/analytics-consolidation.integration.test.ts` (planned)

### T-10 — Complexity scoring engine + weights (FR-04 full)

- **Files** (3): `api/src/analytics/complexity.ts` (new), `pwa/src/views/analytics/Complexity.tsx` (modify — real formula, hover/long-press sub-score popover), `pwa/src/views/analytics/Settings.tsx` (new — weights pane)
- **Implements**: FR-04 — `depth × distinct systems × distinct roles` with tunable weights from `analytics_settings`; replaces/relabels the DD-04 proxy per OQ-2
- **Closes**: AC-04
- **Complexity**: complex
- **Blocked by**: design review; OQ-2; T-16 (settings storage)
- **Verification**: `pwa/src/__tests__/analytics-complexity.test.tsx` (planned) + integration round-trip on `PATCH /api/v1/analytics/settings`

### T-11 — Single-system journey report (FR-05)

- **Files** (2): `api/src/analytics/single-system.ts` (new), `pwa/src/views/analytics/SingleSystem.tsx` (new)
- **Implements**: FR-05 — journeys with `count(DISTINCT system) = 1`, deep-link `?system=:id`
- **Closes**: AC-05
- **Complexity**: moderate
- **Blocked by**: T-14
- **Verification**: `api/__tests__/analytics-single-system.integration.test.ts` (planned)

### T-12 — Critical-path report (FR-06)

- **Files** (2): `api/src/analytics/critical-path.ts` (new — depth-bounded DFS + memoisation, depth cap 20, 1000-path budget, 4 s wall-clock, truncation envelope), `pwa/src/views/analytics/CriticalPaths.tsx` (new)
- **Implements**: FR-06 — including `has_cycle` flagging and `truncation_reason: "depth_cap" | "path_budget" | "wall_clock"`
- **Closes**: AC-06 — test plan MUST include a `wall_clock` truncation fixture (design §2 Open-1, binding)
- **Complexity**: complex
- **Blocked by**: T-14
- **Verification**: `api/__tests__/analytics-critical-path.test.ts` (planned — cyclic fixture, 30-deep depth-cap fixture, fan-out path-budget fixture, injected-clock wall-clock fixture)

### T-13 — AI-candidate filter + CSV export + empty state (FR-07)

- **Files** (3): `api/src/analytics/ai-candidates.ts` (new — configurable `analytics_ai_candidate_definition` filter + RFC 4180 CSV with UTF-8 BOM/CRLF), `pwa/src/views/analytics/Ai.tsx` (modify — replace static placeholder with live table + export button + named empty-state copy), route per OQ-3
- **Implements**: FR-07. **Default definition + candidate semantics are gated on design OQ-4/OQ-4a** (Resolves: B-01 consequence): FR-07's literal defaults (`repetitive: true`, `richness_match: "high"`) match zero rows on the as-built seeds, whose vocabulary is `repetition: "low"|"med"|"high"` + `data_richness: "low"|"med"|"high"` (design §3 FR-07 row); the module must also reconcile with chat's live `ai_candidates` tool (`api/src/chat/tools/ai-candidates.ts`, `leverage_score` ranking) per the OQ-4 answer so analytics and chat agree on what an AI candidate is. Owns the FR-07 Native Conflicts suppression (Resolves: C-04): CSV download uses the iOS share-sheet flow (`navigator.share()` when available; `<a download>` + "Save to Files" hint fallback).
- **Closes**: AC-07, AC-15 — AC-07(a)'s fixture must seed activities matching the OQ-4a-decided vocabulary (its "seed activities" assumption is wrong under FR-07's literal defaults as-built)
- **Complexity**: complex
- **Blocked by**: design review; OQ-4, OQ-4a; T-16 (definition row storage); ontology-manager attribute registration
- **Verification**: `api/__tests__/analytics-ai-candidates.test.ts` (planned — default + reconfigured definition, CSV byte assertions; fixture vocabulary per OQ-4a) + `pwa/src/__tests__/analytics-ai-empty-state.test.tsx` (planned — literal empty-state string, wording revised per OQ-4a)

### T-14 — Analytics REST endpoint scaffold (FR-09)

*(Split in revision 2 per review C-05: the three guard-test files moved to
T-19 — T-14 was 5 files against the 3-file cap.)*

- **Files** (2): `api/src/analytics/routes.ts` (new — the 8 FR-09 report GETs under `/api/v1/analytics/`, zod-validated, NFR-08 envelope), `api/src/router.ts` (modify — mount)
- **Implements**: FR-09; resolves DD-01→server-side migration per OQ-1's answer
- **Closes**: — ; **advances AC-10, AC-11, AC-12** (guard tests land in T-19; AC-10 finally closes at T-18 once `/settings` and `/snapshot/:last_run_at` exist — Resolves: C-03)
- **Complexity**: complex
- **Blocked by**: design review; OQ-1
- **Verification**: manual: with the stack up + authenticated session, `curl 127.0.0.1:8787/api/v1/analytics/consolidation` — expect a 200 NFR-08 envelope (resource on success, `{error:{code,message}}` on failure); full automated coverage lands with T-19's guard tests

### T-15 — Nightly precompute scheduler + cache tables (FR-10)

- **Files** (3): `api/src/analytics/scheduler.ts` (new — node-cron job, default `0 2 * * *`, lock-protected `?refresh=true`, ontology schema-coupling validation, `analytics_alerts` banner rows), `api/src/analytics/cache.ts` (new — `analytics_journey_scores` / `analytics_system_metrics` / `analytics_ai_candidates` SQLite tables + `degraded` staleness envelope), `api/src/server.ts` (modify — schedule at boot)
- **Implements**: FR-10, DD-03 retirement for cached reports
- **Closes**: AC-13, AC-16
- **Complexity**: complex
- **Blocked by**: T-14; OQ-6
- **Verification**: `api/__tests__/analytics-scheduler.test.ts` (planned — manual trigger, +26 h staleness, concurrent refresh, schema-mismatch skip) + `api/__tests__/analytics-scheduler-budget.test.ts` (planned — env-gated 10k-node budget run)

### T-16 — Settings storage + PATCH audit (FR-11)

- **Files** (3): `api/src/analytics/settings.ts` (new — `analytics_settings` + `analytics_settings_audit (ts, before, after, actor)` per graph-core/FR-13 structured-logging shape; `GET`/`PATCH /api/v1/analytics/settings`), `api/src/router.ts` (modify), `api/__tests__/analytics-envelope.test.ts` (extend — add `GET`/`PATCH /settings` envelope coverage per review C-03)
- **Implements**: FR-11; advances AC-10 (envelope test extension is part of this task's DoD — Resolves: C-03)
- **Closes**: AC-17
- **Complexity**: moderate
- **Blocked by**: T-14, T-19 (envelope test to extend)
- **Verification**: `api/__tests__/analytics-settings-audit.test.ts` (planned — PATCH `depth_weight`, assert one audit row with before/after) + the extended `analytics-envelope.test.ts`

### T-17 — Graph-state hash protocol + exec-summary PDF (FR-08)

- **Files** (3): `api/src/analytics/hash.ts` (new — NFR-05 8-rule canonicalisation, SHA-256 lowercase hex), `api/src/analytics/exec-summary.ts` (new — server-side PDF, top-5/top-3/top-3, page-1 monospace footer + `/Subject` metadata, library per OQ-6), `pwa/src/views/analytics/ExecSummary.tsx` (new — launcher route)
- **Implements**: FR-08, NFR-04, NFR-05. The launcher owns the FR-08 Native Conflicts suppression (Resolves: C-04): PDF download uses the iOS share-sheet flow (`navigator.share()` when available; `<a download>` + "Save to Files" hint fallback), with spinner + "generating…" copy during render.
- **Closes**: AC-08, AC-09
- **Complexity**: complex
- **Blocked by**: T-15 (cache snapshot), T-16 (weights); OQ-6 (library)
- **Verification**: `api/__tests__/analytics-exec-summary-pdf.test.ts` + `api/__tests__/analytics-hash-determinism.test.ts` (both planned — byte-identical re-render, weight-mutation hash change, key-order permutation, NFC normalisation)

### T-18 — Cache-snapshot read endpoint (FR-11a) + AC-10 final closure

- **Files** (3): `api/src/analytics/snapshot.ts` (new — `GET /api/v1/analytics/snapshot/:last_run_at`; MUST stay under the `/analytics/` prefix — bare `GET /api/v1/snapshot` is taken by risk-compliance, design §3), `api/src/router.ts` (modify), `api/__tests__/analytics-envelope.test.ts` (extend — add `/snapshot/:last_run_at` coverage; with this, the envelope test spans **all** analytics endpoints)
- **Implements**: FR-11a
- **Closes**: AC-18; **AC-10** (finally — every `/api/v1/analytics/*` endpoint now exists and is envelope-tested; T-14/T-19/T-16 advanced it — Resolves: C-03)
- **Complexity**: moderate
- **Blocked by**: T-15, T-16, T-17, T-19
- **Verification**: `api/__tests__/analytics-snapshot-endpoint.test.ts` (planned — re-derive the PDF's hash from the snapshot payload) + the fully-extended `analytics-envelope.test.ts`

### T-19 — FR-09 guard tests (split from T-14 — Resolves: C-05)

- **Files** (3): `api/__tests__/analytics-envelope.test.ts` (new), `api/__tests__/analytics-no-direct-driver.test.ts` (new), `api/__tests__/analytics-no-write-imports.test.ts` (new)
- **Implements**: the AC-10/AC-11/AC-12 verification harness over `api/src/analytics/` — envelope assertions across T-14's 8 report GETs; grep for `driver.session()`/direct-driver use per AC-11 (grep target adjusted per the OQ-1(d) answer if `runPassthrough` is adopted); grep against `createNode`/`upsertNode`/`createEdge`/`upsertEdge` imports per AC-12. The envelope test is **extended by T-16 (`/settings`) and T-18 (`/snapshot/:last_run_at`)** so AC-10's "all analytics endpoints" closes at T-18, not here (Resolves: C-03).
- **Closes**: AC-11, AC-12; **advances AC-10**
- **Complexity**: moderate
- **Blocked by**: T-14; OQ-1
- **Verification**: the three test files themselves (planned) — `bun test api/__tests__/analytics-envelope.test.ts api/__tests__/analytics-no-direct-driver.test.ts api/__tests__/analytics-no-write-imports.test.ts`, all green

### T-20 — System-map server metrics module (FR-01, split from T-07 — Resolves: C-05)

- **Files** (1): `api/src/analytics/system-map.ts` (new — degree centrality + integration count per `System` over `INTEGRATES_WITH`; reuse DD-02's graphology degree output where OQ-1 permits; served as T-14's `GET /api/v1/analytics/systems`)
- **Implements**: FR-01 (server side)
- **Closes**: — ; advances AC-01 (closed at T-07)
- **Complexity**: moderate
- **Blocked by**: T-14; OQ-1
- **Verification**: manual: with the stack up + authenticated session, `curl 127.0.0.1:8787/api/v1/analytics/systems` — expect 6 systems (per `retail-mini` seed) each carrying degree + integration count; envelope covered by T-19's `analytics-envelope.test.ts`

### T-21 — Accent ramp tokens + systems tab registration (FR-01, split from T-07 — Resolves: C-05, C-01)

- **Files** (3): `pwa/src/styles/companygraph/tokens.css` (modify — add the five ramp stops `--accent-100/-300/-500/-700/-900` derived from `--accent`; design §2 Pin-4 — today the file defines only `--accent`/`--accent-soft`/`--on-accent`, and `pwa/src/theme.ts` does not exist), `pwa/src/route.ts` (modify — register the `systems` tab, name per OQ-3), `pwa/src/views/index.tsx` (modify — VIEWS entry)
- **Implements**: FR-01 (ramp + route); the token home AC-01's corrected recipe asserts against
- **Closes**: — ; advances AC-01 (closed at T-07)
- **Complexity**: simple
- **Blocked by**: design review; OQ-3
- **Verification**: manual: in devtools on `#/analytics/systems`, `getComputedStyle(document.documentElement)` resolves all five `--accent-*` stops; `bun run scripts/design-conformance.ts --view pwa/src/views/analytics/Systems.tsx` (at T-07) reports every `var(--…)` token-resolvable

## Validation checkpoints

| After | Run |
|-------|-----|
| T-01..T-06 (ratify) | `scripts/spec/spec-traceability.sh .claude/specs/cto-analytics` — expect exit 0 |
| every pending task | `bun run typecheck` |
| pending tasks touching `pwa/src/views/` | `bun run scripts/design-conformance.ts --view <file>` |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC sweep |
