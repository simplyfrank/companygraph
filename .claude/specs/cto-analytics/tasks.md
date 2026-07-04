---
feature: "cto-analytics"
created: "2026-07-04"
author: "spec-author (as-built reconciliation)"
status: "draft"
revision: 1
reviewing_requirements_revision: 2
reviewing_design_revision: 1
size: "medium"
total_tasks: 18
---

# Tasks: cto-analytics (reconciliation + remaining scope)

## Reading guide

Two kinds of tasks, modeled on `_baseline/tasks.md`:

- **T-01..T-06 — Ratify (as-built)**: confirm surfaces that already exist
  (built off-spec, adopted 2026-07-04 via `_baseline`). Nothing to implement;
  each verifies the as-built artifact against reality. Ratify tasks close an
  AC only where the AC is genuinely met (or superseded); partial builds
  *advance* an AC and the closing pending task is named.
- **T-07..T-18 — Pending (open scope)**: normal build tasks for the unbuilt
  FRs. Their Verification entries name the test files the requirements'
  AC table prescribes — those files do **not** exist yet and are created by
  the task ("planned"). Pending tasks are gated on design review + the §10
  Open Questions (OQ-*) named per task.
- **Order**: ratify tasks first (no dependencies); pending tasks
  top-to-bottom with explicit `Blocked by`.

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

### T-07 — System map view + system metrics (FR-01)

- **Files** (3): `pwa/src/views/analytics/Systems.tsx` (new), `api/src/analytics/system-map.ts` (new), `pwa/src/route.ts` + `pwa/src/views/index.tsx` (register tab)
- **Implements**: FR-01 — force-directed `System`/`INTEGRATES_WITH` map, degree centrality + integration count per system, 5-stop monochromatic accent ramp; reuse DD-02's graphology degree output where OQ-1 permits
- **Closes**: AC-01
- **Complexity**: complex
- **Blocked by**: design review; OQ-1, OQ-3
- **Verification**: `pwa/src/__tests__/analytics-system-map.test.tsx` (planned — AC-01's ramp-stop assertion; requirements' `pwa/__tests__/` path updated to the actual `pwa/src/__tests__/` layout) + manual on iPad Safari (touch): open `#/analytics/systems`, expect 6 system nodes per `retail-mini` seed

### T-08 — Matrix completion: deep-links, virtualisation, filters (FR-02 full)

- **Files** (2): `pwa/src/views/analytics/Matrix.tsx` (modify), `pwa/src/views/analytics/Matrix.module.css` (modify)
- **Implements**: FR-02 — cell links to `#/explorer/activities?system_id=:sid&domain_id=:did` (binding param names per design §2 Open-3), virtualised grid, domain/system pre-filters
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
- **Implements**: FR-07
- **Closes**: AC-07, AC-15
- **Complexity**: complex
- **Blocked by**: design review; OQ-4; T-16 (definition row storage); ontology-manager attribute registration
- **Verification**: `api/__tests__/analytics-ai-candidates.test.ts` (planned — default + reconfigured definition, CSV byte assertions) + `pwa/src/__tests__/analytics-ai-empty-state.test.tsx` (planned — literal empty-state string)

### T-14 — Analytics REST endpoint scaffold + guard tests (FR-09)

- **Files** (3): `api/src/analytics/routes.ts` (new — the 8 FR-09 report GETs under `/api/v1/analytics/`, zod-validated, NFR-08 envelope), `api/src/router.ts` (modify — mount), guard tests
- **Implements**: FR-09; resolves DD-01→server-side migration per OQ-1's answer
- **Closes**: AC-10, AC-11, AC-12
- **Complexity**: complex
- **Blocked by**: design review; OQ-1
- **Verification**: `api/__tests__/analytics-envelope.test.ts`, `api/__tests__/analytics-no-direct-driver.test.ts`, `api/__tests__/analytics-no-write-imports.test.ts` (all planned — the latter two grep `api/src/analytics/` per AC-11/AC-12)

### T-15 — Nightly precompute scheduler + cache tables (FR-10)

- **Files** (3): `api/src/analytics/scheduler.ts` (new — node-cron job, default `0 2 * * *`, lock-protected `?refresh=true`, ontology schema-coupling validation, `analytics_alerts` banner rows), `api/src/analytics/cache.ts` (new — `analytics_journey_scores` / `analytics_system_metrics` / `analytics_ai_candidates` SQLite tables + `degraded` staleness envelope), `api/src/server.ts` (modify — schedule at boot)
- **Implements**: FR-10, DD-03 retirement for cached reports
- **Closes**: AC-13, AC-16
- **Complexity**: complex
- **Blocked by**: T-14; OQ-6
- **Verification**: `api/__tests__/analytics-scheduler.test.ts` (planned — manual trigger, +26 h staleness, concurrent refresh, schema-mismatch skip) + `api/__tests__/analytics-scheduler-budget.test.ts` (planned — env-gated 10k-node budget run)

### T-16 — Settings storage + PATCH audit (FR-11)

- **Files** (2): `api/src/analytics/settings.ts` (new — `analytics_settings` + `analytics_settings_audit (ts, before, after, actor)` per graph-core/FR-13 structured-logging shape; `GET`/`PATCH /api/v1/analytics/settings`), `api/src/router.ts` (modify)
- **Implements**: FR-11
- **Closes**: AC-17
- **Complexity**: moderate
- **Blocked by**: T-14
- **Verification**: `api/__tests__/analytics-settings-audit.test.ts` (planned — PATCH `depth_weight`, assert one audit row with before/after)

### T-17 — Graph-state hash protocol + exec-summary PDF (FR-08)

- **Files** (3): `api/src/analytics/hash.ts` (new — NFR-05 8-rule canonicalisation, SHA-256 lowercase hex), `api/src/analytics/exec-summary.ts` (new — server-side PDF, top-5/top-3/top-3, page-1 monospace footer + `/Subject` metadata, library per OQ-6), `pwa/src/views/analytics/ExecSummary.tsx` (new — launcher route)
- **Implements**: FR-08, NFR-04, NFR-05
- **Closes**: AC-08, AC-09
- **Complexity**: complex
- **Blocked by**: T-15 (cache snapshot), T-16 (weights); OQ-6 (library)
- **Verification**: `api/__tests__/analytics-exec-summary-pdf.test.ts` + `api/__tests__/analytics-hash-determinism.test.ts` (both planned — byte-identical re-render, weight-mutation hash change, key-order permutation, NFC normalisation)

### T-18 — Cache-snapshot read endpoint (FR-11a)

- **Files** (2): `api/src/analytics/snapshot.ts` (new — `GET /api/v1/analytics/snapshot/:last_run_at`; MUST stay under the `/analytics/` prefix — bare `GET /api/v1/snapshot` is taken by risk-compliance, design §3), `api/src/router.ts` (modify)
- **Implements**: FR-11a
- **Closes**: AC-18
- **Complexity**: moderate
- **Blocked by**: T-15, T-17
- **Verification**: `api/__tests__/analytics-snapshot-endpoint.test.ts` (planned — re-derive the PDF's hash from the snapshot payload)

## Validation checkpoints

| After | Run |
|-------|-----|
| T-01..T-06 (ratify) | `scripts/spec/spec-traceability.sh .claude/specs/cto-analytics` — expect exit 0 |
| every pending task | `bun run typecheck` |
| pending tasks touching `pwa/src/views/` | `bun run scripts/design-conformance.ts --view <file>` |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC sweep |
