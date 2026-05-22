---
feature: chat-interface
reviewing: tasks
reviewer: spec-review-agent
reviewed_at: 2026-05-23
verdict: revise
counts: { blockers: 3, concerns: 6, nits: 5 }
---

# Review: chat-interface tasks

## Verdict

Tasks are largely well-formed, but three blockers prevent approval:
parallel-tier file-write collisions on `registry.ts`, a circular/
out-of-order dependency between T-14/T-15 and T-22, and missing
explicit coverage for ACs AC-25 (auto-route classifier) and AC-27 (a)
narration. Fix and re-review.

## Blockers

| ID | T-ref | What's wrong | How to fix |
|----|-------|--------------|------------|
| B-01 | T-12, T-13, T-14, T-15 | All four tasks are flagged `Parallel? yes (with T-12..T-15)` and each `register[s] in registry.ts`. That is a guaranteed file-write collision on `api/src/chat/tools/registry.ts` — three Agent sub-tasks editing the same file in parallel cannot merge cleanly. The spec-workflow's no-3-file rule isn't enough; the conflict is on a single shared file. | Either (a) make `registry.ts` auto-discover tool modules from a `tools/` directory glob at server boot (preferred — eliminates the merge entirely), OR (b) re-serialise T-12..T-15 (drop `Parallel? yes`), OR (c) introduce a deterministic per-tool `register()` side-effect that each tool module performs at import time + a final T-15b merge step that touches only `registry.ts`. Update Tier 2 accordingly. |
| B-02 | T-14, T-15 | Both depend on **T-22 (enriched seed)**, but T-22 is on Tier 1/Tier 5 in the prose graph ("Tier 5 (parallel): T-21, T-22, T-26 (after T-17)") yet T-14 + T-15 are on Tier 2 (after T-09 + T-10 + T-11). The dependency graph diagram puts T-22 on Tier 1, the prose ascii says Tier 5, and the effort table puts T-22 on Tier 1. T-14/T-15 cannot run on Tier 2 if T-22 hasn't shipped. Tier annotations are mutually inconsistent. | Pick one: move T-22 to Tier 1 (this is correct — it has no dependency on T-17 — its only Dep is T-01, per the task table) and delete the "Tier 5: T-22" entry from the parallel-tiers list. Update the effort table to match (T-22 is already on Tier 1 there — good). The prose dependency-graph diagram contains T-22 in two places; remove the duplicate. |
| B-03 | T-11 | Field `Parallel? yes (with T-10, T-12..T-15)` is wrong. T-11 depends on T-09; T-12..T-15 depend on T-11. T-11 cannot be parallel with T-12..T-15 — it must precede them. The compressed graph confirms "Tier 2 (parallel, after T-09 + T-10 + T-11): T-12, T-13, T-14, T-15", which contradicts T-11's `Parallel?` field. | Change T-11's `Parallel?` to `yes (with T-10)` only, or `no — required precondition for Tier 2`. |

## Concerns

| ID | T-ref | What's wrong | How to fix |
|----|-------|--------------|------------|
| C-01 | T-11 | T-11 lists 20 markdown overlay files + a classifier parser + a CI test in a single task, rated `moderate`. Per the user-prompted heuristic, that's ~8000 words of curated prose + a JSON parser implementation + role-coverage CI — at least `high`. Under-rated complexity → unrealistic effort estimate. | Rate `high`; consider splitting into T-11a (registry skeleton + auto-route) and T-11b (20 prompt overlays). |
| C-02 | T-09 vs T-11 | T-09's Verification lists `api/__tests__/chat/classifier-prefix-parse.test.ts` (DD-18 parser). T-11's Verification lists `api/__tests__/chat/role-autoroute.test.ts`. The classifier parser is the DD-18 contract; the auto-route resolver is what T-11 owns. These two tests are conflated. | Clarify: T-09 owns `classifier-prefix-parse.test.ts` (parser unit); T-11 owns `role-autoroute.test.ts` (resolver — assert prefix-emitted role becomes active role). Cross-reference in both Verification fields. |
| C-03 | T-16 | AC-27 (a) "tool error narration" is listed in T-16's `AC` field but its only test path is the catch-all `agent-grounded-answer.integration.test.ts`. The design's File Changes table names `api/__tests__/chat/tool-error-narration.integration.test.ts` (new — moderate) for AC-27 (a)/(c). No task creates that file. | Add `tool-error-narration.integration.test.ts` to T-16's Verification list, OR split it into a new T-16b that depends on T-16 and creates the file. |
| C-04 | T-22 | Verification has a `manual:` curl repro but no `api/__tests__/chat/seed-attrs-presence.test.ts` reference (which T-19 creates). T-19 depends on T-22, so the test runs later — that's fine — but T-22's Verification should cross-reference T-19's test as its automated proof. | Add `(also covered by T-19's seed-attrs-presence.test.ts)` to T-22's Verification. |
| C-05 | T-27 (NFR-02 latency) | The user flagged this directly: T-27 hand-waves the NFR-02 latency budget (P50 ≤ 12 s, P99 ≤ 30 s for 3-tool ReAct). There is no dedicated perf-smoke task with a measured assertion. Manual end-to-end test cannot reliably catch perf regressions. | Add T-28 — perf smoke: run 10 multi-tool conversations against MockLLMClient (deterministic) + a calibrated network simulation, assert P50/P99 against budget. Mark `manual: <repro>` if automation is not feasible in CI. |
| C-06 | T-18 grep scope | AC-25 says "extend `no-auth-grep.test.ts` include list to chat surface". T-18's Verification says greps run against `api/src/chat/**` + `pwa/src/views/chat/**`. The PWA path is `pwa/src/views/chat/` (singular file `chat.tsx` per AC-25 prose vs directory `chat/` per design). Mismatch between requirement prose and design tree. | Resolve: design tree is the truth (`pwa/src/views/chat/` directory). Update AC-25 prose elsewhere; T-18's scope is correct as-is. Add a one-line sanity check to T-18 that both globs resolve to ≥ 1 file. |

## Nits

| ID | T-ref | Note |
|----|-------|------|
| N-01 | T-01 | "Add dependencies" Verification is `manual: run bun install` — fine. Consider also asserting `bun build api/src/server.ts --no-bundle` clean (already there — good). Tighten by adding a grep assertion that `data/chat.db*` line is in `.gitignore`. |
| N-02 | T-03 | "round-trip create-conv/insert-msg/load-bound-context" is a multi-assertion sentence. Split into named `it(...)` cases in the test file for readability — non-blocking. |
| N-03 | T-09 | "10 fixture scenarios — one per AC-driven flow". The 32 ACs imply more like 10–12 representative scenarios. State which ACs each fixture covers (mapping comment in `fixtures/index.json`). |
| N-04 | T-17 | Lists `api/src/server.ts` (`boot initChatDb()`) and `api/src/router.ts` + `api/src/routes/chat.ts` — three files. Acceptable per the no-3-file rule. Note for future: the openapi.json regeneration (CLAUDE.md NFR-11) is not in this task. If `chat/messages` should appear in the OpenAPI document, add it as an explicit Files entry. |
| N-05 | (missing task) | No task documents the chat-interface surface in the root `CLAUDE.md` "Follow-up specs" table (which already lists it). The current CLAUDE.md says chat-interface is "NL → Cypher → grounded answer". Rev-3.1 is agentic ReAct. Optional: add T-29 — update `.claude/CLAUDE.md` paragraph for chat-interface to match rev-3.1. |

## Strengths

- The dependency graph is well-articulated with explicit parallel tiers and an effort table (rare and helpful).
- Every AC-01..AC-32 maps to at least one named test path in either a task's Verification field or in T-23's exhaustive PWA test list.
- Refusal-precedence helpers are isolated into T-05 with verbatim-string assertions — locks the FR-G* fixed strings.
- T-09's `llm-degraded-mode.test.ts` + `classifier-prefix-parse.test.ts` lock the FR-B06 + DD-18 contracts at the foundation tier.
- T-18 grep coverage (no-direct-driver, no-write-imports, no-auth) preserves the rev-2 safety invariants under the new tool surface.
- T-23's twelve sub-file PWA implementation is correctly rated `high` and lists eleven distinct test files (one per AC).
- Per-turn memoization, transactional quota, and progress-snapshot store are each split into their own tasks (T-04, T-08, T-10) — good granularity.

## Coverage check

- **Every AC-01..AC-32 covered by ≥ 1 task's Verification: yes** with one caveat (AC-27 (a) "tool error narration" — the dedicated test file `tool-error-narration.integration.test.ts` named in design is not created by any task; see C-03). All 32 ACs appear in at least one `AC` field; 31 have explicit test paths and 1 has the gap noted.

- **Every DD-* implemented by ≥ 1 task: yes**. Spot-check: DD-01 (T-17), DD-03 (T-10), DD-04 (T-12, T-13), DD-06 (T-16), DD-07 (T-09), DD-08/DD-09 (T-03, T-04), DD-10 (T-08, T-17, T-25), DD-11 (T-07, T-24), DD-12 (T-23), DD-13 (T-05, T-16), DD-14 (T-06), DD-15 (T-12), DD-16 (T-14), DD-17 (T-11), DD-18 (T-09, T-11), DD-21 (T-19, T-22), DD-22 (T-03, T-16). All present.

- **Every new file from design's File Changes table created by ≥ 1 task: mostly yes**. Confirmed missing: `api/__tests__/chat/tool-error-narration.integration.test.ts` (C-03). Other 60+ files are accounted for. The 22 prompts markdown files are bundled into T-11 — acceptable.

- **Dependency graph acyclic: no** — B-02 (T-14/T-15 vs T-22 tier mismatch) and B-03 (T-11 falsely marked parallel with T-12..T-15) are inconsistencies, not formal cycles, but they make the tier annotations untrustworthy. Once fixed, the graph is acyclic.

- **Verification field non-trivial for every task: yes**. Every task has either a concrete test path OR a `manual:` line with input mode + observable outcome. T-01's `manual: run bun install ... expect exit 0 and dep tree includes new packages` is the weakest but still names input mode + outcome — acceptable per the spec-completion hook.

## Additional notes (from user-supplied review checklist)

- **T-01 / lockfile**: covered by `bun install` in Verification. OK.
- **OpenAPI regeneration**: not explicitly in any task. CLAUDE.md NFR-11 says `/api/v1/openapi.json` is generated at server boot from zod definitions — implicit if the chat endpoint is registered correctly via the existing OpenAPI generation hook. Worth confirming in T-17 that the generator picks up `chatRequestSchema`. Flagged as nit N-04.
- **CLAUDE.md update for chat-interface surface**: not in tasks. Nit N-05.
- **T-21/T-22/T-26 parallel-safety**: confirmed — `api.ts` (T-21), `retail-mini-enriched.json` + `scripts/seed-enriched.ts` + `package.json` (T-22), `route.ts` (T-26). No file collisions. Note T-22 adds a script to `package.json`, which T-01 also modifies. If T-22 runs after T-01, that's a sequential edit — fine.
- **T-23 vs T-24/T-25**: graph says T-24 + T-25 depend on T-23 — consistent with task table.

## Files referenced

- `/Users/frank/Documents/coding/companygraph/.claude/specs/chat-interface/tasks.md`
- `/Users/frank/Documents/coding/companygraph/.claude/specs/chat-interface/requirements.md`
- `/Users/frank/Documents/coding/companygraph/.claude/specs/chat-interface/design.md`
- `/Users/frank/Documents/coding/companygraph/.claude/CLAUDE.md`
