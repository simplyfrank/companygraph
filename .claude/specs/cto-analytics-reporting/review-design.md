---
feature: "cto-analytics-reporting"
reviewing: "design"
artifact: "design.md (rev 1, status:draft)"
reviewer: "spec-review-agent"
verdict: "revise"
reviewed_at: "2026-07-04"
review_pass: "1 of max 2"
---

# Design Review — cto-analytics-reporting

Reviewed cold against the inherited-approved `requirements.md`, the three
newly-decided open questions (OQ-1/2/3), and the live codebase
(`api/src/storage/modules.ts`, `api/src/neo4j/read-only-graph.ts`,
`api/src/analytics/routes.ts`, `api/src/chat/persistence.ts`,
`api/src/router.ts`, `api/src/env.ts`, `api/src/errors.ts`, `api/src/server.ts`),
plus pdfkit's actual `generateFileID` / `_finalize` source.

The engineering is sound and traceable: the hash reuse, the dedicated
capture query, the SQLite isolation, the Promise-mutex, and the
router-ordering call-out are all correct against reality. Two things force
`revise`: **(B-01)** the design still vendors a TTF font, directly
contradicting OQ-1-RESOLVED (Courier standard-14, no vendored font); and
**(B-02)** the stated byte-determinism mechanism does not pin pdfkit's
trailer `/ID` array, which NFR-04 explicitly names — the `/ID` is derived
at `new PDFDocument()` time, before the design's post-construction date
assignment runs. Both are concrete and land well inside a single revision.

## Blockers

### B-01 — DD-03 / §5.3 / §7.4 / OQ-1 still vendor a TTF font; OQ-1 is RESOLVED to standard-14 Courier (no vendored asset)

OQ-1 is now settled law: **PDF font = PDF standard-14 Courier**, built-in,
monospace, **no vendored TTF, no `api/assets/fonts/`**. Courier is a
non-embedded standard-14 face and is inherently deterministic (nothing is
subsetted into the file), and it is monospace, so it satisfies the page-1
hash-footer requirement directly.

The design still assumes a vendored TTF in multiple load-bearing places:

- **DD-03** (§2 table): *"a **bundled TTF font** embedded from a repo-vendored
  file (no system-font lookup — system fonts vary by host)"*.
- **§5.3 step 5**: `doc.registerFont("body", "api/assets/fonts/<vendored>.ttf")`
  *"a **repo-vendored TTF** so font subsetting is host-independent (OQ-1)"*.
- **§3 OQ-1**: recommends *"vendor a single OFL/Apache-licensed family under
  `api/assets/fonts/`"* — this recommendation is now overruled.
- **§7.4** lists `api/assets/fonts/` (a vendored TTF) as a new file under T-05.
- **tasks.md T-05 Files** lists `api/assets/fonts/` (new — the vendored TTF).

**Recommendation:** Rewrite DD-03/§5.3 to use `doc.font("Courier")`
(pdfkit's built-in standard-14 alias) for the body and footer — no
`registerFont`, no embedded font, no subsetting. Delete the §7.4 vendored-asset
row and drop `api/assets/fonts/` from T-05's Files list (the design already
notes this shrinks T-05). This also *removes* the single biggest
nondeterminism source (font-subset ordering, which NFR-04 explicitly calls
out), so it strengthens the byte-equality claim rather than weakening it.
Note in DD-03 that standard-14 Courier is not embedded, so there is no font
stream in the PDF at all — the determinism argument becomes simpler.

### B-02 — DD-03 / §5.3 does not pin pdfkit's trailer `/ID` array, which NFR-04 explicitly requires; and it sets the dates too late to make `/ID` deterministic

NFR-04 enumerates the internals that MUST be pinned and includes "xref
timestamps" among them; the trailer `/ID` array is the remaining
per-render-varying internal the design does not address, and it is the one
that will actually break AC-08's byte-equality if left default.

Verified against pdfkit source:
- `_finalize()` writes `ID: [this._id, this._id]` into the trailer.
- `this._id = PDFSecurity.generateFileID(this.info)` is computed **in the
  constructor** (`new PDFDocument(...)`), and `generateFileID` builds its
  MD5 input from `info.CreationDate.getTime()` + Producer + other info
  fields.

Two concrete consequences the design misses:

1. `/ID` is *not* mentioned anywhere in §5.3's enumerated determinism steps.
   Left at default it is deterministic **only** if the info dict feeding
   `generateFileID` is already pinned at construction time.
2. §5.3 step 2 pins the dates **after** construction
   (`doc.info.CreationDate = new Date(0)` on the already-built `doc`). But
   `generateFileID` already ran against the *default* wall-clock
   `CreationDate` inside `new PDFDocument(...)` at step 1. So the `/ID` is
   computed from `Date.now()` and differs between two renders seconds apart —
   AC-08(a) fails despite every visible field being pinned.

**Recommendation:** Set `CreationDate`/`ModDate`/`Producer`/`Creator` via the
**constructor** `info` option so `generateFileID` hashes the pinned values,
e.g. `new PDFDocument({ pdfVersion: "1.3", compress: false, autoFirstPage:
true, margin: 48, info: { CreationDate: new Date(0), ModDate: new Date(0),
Producer: "companygraph", Creator: "companygraph" } })`, and add an explicit
determinism step: *"the trailer `/ID` array is a deterministic
`md5(info)`-derived value once the info dict is pinned at construction — do
NOT assign the dates post-construction, or `generateFileID` will have
already hashed the wall clock."* Keep `/Subject` (the hash) set after
construction — it does not feed `generateFileID` and can be set later. With
these two changes plus B-01 (no embedded font), byte-determinism under
pdfkit on Bun is genuinely achievable; without them AC-08 is not met.

## Concerns

### C-01 — `withCacheEnvelope` signature mismatch between DD-10 and §5.4 / T-01

DD-10 declares `withCacheEnvelope(report, result)` (two args); §5.4 and the
task DoD declare `withCacheEnvelope(body)` (one arg). The `result` variant is
never used in §5.6/§5.7. **Recommendation:** pick one signature (the §5.4
one-arg `withCacheEnvelope(body)` reading `MAX(last_run_at)` from the table
is the coherent one) and correct the DD-10 cell so the implementer is not
guessing which is authoritative.

### C-02 — Stale "no auth code paths" governance claim vs current house rules

§1, §10, DD-09, and the inherited requirements repeat "no auth code paths in
this spec's source (NFR-08)". Per the current `.claude/CLAUDE.md`, the
"no auth code paths" rule (former NFR-08/AC-22) was **retired** in the
2026-07-04 adoption and its guard test deleted; `NFR-08` now denotes the
**response envelope** rule, which the design also (correctly) cites. The
design is not *doing* anything wrong — it simply adds no auth and rides the
central router gate — but the justification text references a retired rule
and double-binds the `NFR-08` label. **Recommendation:** reword DD-09 to
"single-tenant sentinel actor; a future auth backfill fills a real identity
via the central router gate (`api/src/auth/`) without a schema migration",
and drop the "no auth code paths house rule" phrasing. Not a blocker: the
sentinel-actor design is forward-compatible and correct.

### C-03 — OQ-2 (N=7 retention pruning) is decided but has no design mechanism or task

OQ-2 is RESOLVED: rolling **N=7** run headers, prune the heavy
`nodes_json`/`edges_json` blobs beyond that. The design records the
*recommendation* in §3 OQ-2 but no DD, no §5.4 write path, and no task step
implements the prune. `writeRun()` (§5.6) never prunes; T-04's DoD does not
mention retention. **Recommendation:** add a one-line rule to DD-06/§5.4 —
"at the end of each `writeRun()`, `UPDATE analytics_run SET nodes_json='',
edges_json='' WHERE last_run_at NOT IN (SELECT last_run_at FROM analytics_run
ORDER BY last_run_at DESC LIMIT 7)`" (or DELETE of older run rows entirely,
per the resolved scope) — and fold it into T-04's DoD. Without it the
`analytics_run` snapshot blobs grow unbounded (the exact risk OQ-2 closed).
Note: pruning the blob of an older run means `/snapshot/:last_run_at` for a
pruned run can no longer return `nodes`/`edges` — the design should state
`handleSnapshot` returns `404 not_found` (or a `pruned` marker) for runs
beyond the window, so AC-18's contract stays well-defined.

### C-04 — `attributes_parsed` vs `attributes` naming drift across the hash rule (d) chain

Requirements NFR-05 rule (d) and the `HashInput` types in §5.1 name the field
`attributes` (rule d) / `attributes_parsed` (the `HashNode` interface). §5.1's
`nfc(canonical)` runs over the object whose node/edge members carry
`attributes_parsed`, so the *serialised key* is `attributes_parsed`, not
`attributes`. That is internally consistent (the hash is over whatever key is
present) but the field name diverges from the requirement's rule (d) wording
("each node/edge's `attributes` field is the parsed object"). **Recommendation:**
either rename the interface field to `attributes` so the serialised canonical
form matches the requirement's stated key, or add one sentence noting the
canonical key is `attributes_parsed` by design (the hash is self-consistent
and the requirement's rule (d) is about *parsed-not-string*, not the literal
key name). Cosmetic for determinism, but AC-18's external re-derivation needs
the exact key an outside verifier will reproduce.

### C-05 — Rule (g) LF-normalisation is asserted but not enforced for string *values*

§5.1's comment says *"LF-only: JSON has no raw newlines (rule g)"*. True for
JSON *structure*, but a node `name`/attribute *value* containing a literal
`\r\n` is preserved verbatim by `canonicalStringify` (it delegates to
`JSON.stringify`, which escapes `\r`→`\\r` and `\n`→`\\n` distinctly). Two
snapshots that differ only in CRLF vs LF inside a string value would hash
differently — rule (g) says they should not. **Recommendation:** extend the
`nfc()` helper (or add a sibling) to also replace `\r\n`→`\n` in string
values before hashing, or explicitly scope rule (g) in the design to
"structural newlines only; value CRLF is out of scope because graph-core
stores values verbatim". Low likelihood at retail scale, but rule (g) is a
named NFR-05 rule and AC-09 does not currently test it — worth a one-line
decision.

## Nits

### N-01 — `analytics_cache.test.ts` (T-01) is missing from design §7.5 test table

T-01's Verification cites `api/__tests__/analytics-cache.test.ts`, but §7.5
(the test-file coverage table) lists nine test files and omits this one. With
`enforced:true` the hook checks design↔tasks file agreement; add the row for
completeness. Cosmetic — test files are `allow`-globbed.

### N-02 — `status` column ('ok' | 'ai_skipped') in `analytics_run` is undocumented as an enum

§5.4 DDL declares `status TEXT NOT NULL` and §5.6 writes `"ok"`/`"ai_skipped"`,
but the DDL has no CHECK and the two values are only discoverable from the
scheduler. Optional: add `CHECK (status IN ('ok','ai_skipped'))` for parity
with the `analytics_settings` single-row CHECK already present.

### N-03 — `validateAiKeys` "in-process call … HTTP fallback" is hand-wavy

§5.6 says it reads schema "in-process call to the schema cache when
available; HTTP fallback". The concrete resolution path is left open. Not
blocking (a soft dependency, AI-skip is a graceful degrade), but T-04's
implementer will have to choose; a one-line pin (e.g. "import
ontology-manager's schema-cache accessor directly; no HTTP") would remove the
ambiguity.

## Completeness / Traceability

| FR / AC | Design coverage | Task | Status |
|---------|-----------------|------|--------|
| FR-08 (exec PDF + hash) | DD-02/03/04, §5.1, §5.3, §5.7, §6 | T-02/05/06/09 | Covered — **blocked by B-01 (font), B-02 (/ID)** |
| FR-10 (scheduler + cache + refresh + staleness + ontology validation) | DD-06/07/10, §5.4, §5.6 | T-01/04/07 | Covered — **C-03 (retention) missing** |
| FR-11 (settings + audit) | DD-08/09, §5.5 | T-03/09 | Covered |
| FR-11a (snapshot read) | §5.7 `handleSnapshot`, §6 | T-06/09 | Covered — see C-03 (pruned-run behaviour) |
| NFR-04 (byte-reproducible PDF) | DD-03, §5.3 | T-05 | **Not fully met — /ID unpinned (B-02); font embed contradicts OQ-1 (B-01)** |
| NFR-05 (8-rule hash) | DD-04, §5.1 | T-02 | Covered — rules a/c/e/g via `canonicalStringify` (verified `modules.ts:37`); b/d/f layered; **rule g value-CRLF gap (C-05)** |
| NFR-R1 (SQLite isolation) | DD-06, §5.4 (mirrors `chat/persistence.ts` — verified) | T-01 | Covered |
| NFR-R2 (no ERROR_CODES churn) | §10, reuses `not_found`/`invalid_payload` (both verified in `errors.ts`) | T-03/06 | Covered — **matches OQ-3-RESOLVED** |
| NFR-R3 (30-min budget) | §8 | T-04 | Covered (test) |
| NFR-08 (envelope) | DD-10, §5.4 `withCacheEnvelope` | T-07 | Covered — **C-01 signature drift** |
| NFR-R5 (bun transpile) | §10 | all (typecheck DoD) | Covered |
| AC-08 | §5.3, §8 | T-05 | **Blocked by B-01/B-02** |
| AC-09 | §5.1, §8 | T-02 | Covered (C-05 rule-g edge) |
| AC-13 | §5.6, §8 | T-04 | Covered |
| AC-16 | §8 | T-04 | Covered |
| AC-17 | §5.5, §8 | T-03 | Covered |
| AC-18 | §5.7, §8 | T-06 | Covered (C-03 pruned-run edge) |
| AC-R1 | DD-08, §5.5 | T-03 | Covered |
| AC-R2 | §5.8, §8 | T-08 | Covered |
| AC-R3 | DD-10, §5.4 | T-07 | Covered |
| RD-1 (read-only reads) | DD-05, §5.2 `runReadOnlyGraph` (verified — no `getDriver()` in `api/src/analytics/`) | T-04 | Covered — guard tests extend for free |
| OQ-1 (font) RESOLVED | — | — | **VIOLATED — B-01** |
| OQ-2 (N=7 retention) RESOLVED | §3 note only | — | **Partially — no mechanism/task, C-03** |
| OQ-3 (no new error codes) RESOLVED | §10 | — | **Honoured** |

**Verified against reality (all confirmed true):**
- `canonicalStringify` exists at `api/src/storage/modules.ts:37` and
  implements rules a/c/e/g (recursive key-sort, `JSON.stringify` number form,
  no whitespace). **DD-04 is correct.**
- `read-only-graph.ts` `GRAPH_QUERY` (lines 81–100) projects edge `id` as a
  synthetic `a.id+'->'+b.id+':'+type(r)` string — **not** the real edge `id`
  property — and omits `attributes_json`/`createdAt` and node `updatedAt`. A
  dedicated capture query **is** genuinely necessary. **DD-05 is correct.**
- `runReadOnlyGraph()` enforces read-only session + tx timeout, no row cap —
  correct for a full-graph capture. **RD-1 honoured.**
- `node-cron` is imported and `cron.schedule(...)` already used in
  `api/src/server.ts:1,53` (audit-retention job). A second scheduled task is
  feasible. **Scheduler hook confirmed.**
- `api/src/chat/persistence.ts` uses `bun:sqlite` `Database`, module-scoped
  singleton, `resolveDbPath` — DD-06's mirror pattern is real and isolated
  (separate `ANALYTICS_DB_PATH` file). **SQLite isolation confirmed.**
- `ANALYTICS_COMPLEXITY_WEIGHTS` / `ANALYTICS_AI_CANDIDATE_DEFINITION` exist in
  `api/src/analytics/routes.ts:51,66`. **DD-08 seed source confirmed.**
- `analytics/([^/]+)` report regex is at `router.ts:820`, matched greedily —
  it WOULD swallow `settings` / `exec-summary.pdf`. **DD-11's above-ordering
  requirement is real and correctly specified.**
- `not_found` and `invalid_payload` both exist in `api/src/errors.ts`. **OQ-3
  reuse is valid; no enum change needed.**
- Promise-mutex (DD-07) is sound for single-process/single-tenant: `inFlight`
  guard returns the in-flight promise; cleared in `finally`. Concurrent
  `?refresh=true` awaits the same run — **no double-exec.**
- Hook coverage spot-check: every file in tasks.md T-00..T-09 appears in
  design §7 and vice versa, **except** the vendored-font asset (to be removed
  per B-01) and the `analytics-cache.test.ts` omission (N-01).

## Verdict

**revise.** Two blockers (B-01 vendored font contradicts OQ-1-RESOLVED; B-02
pdfkit `/ID` unpinned + dates set post-construction, so AC-08 byte-equality
is not actually achieved as written). Both are small, concrete, and
independently confirmed against pdfkit source and the resolved OQs — they fit
comfortably in the one remaining review pass. Five concerns (envelope
signature drift, retired-rule wording, missing N=7 retention mechanism,
attributes-key naming, rule-g value-CRLF) and three nits. The design's
architecture, hash reuse, capture query, SQLite isolation, mutex, and
router-ordering are all correct against the live codebase; byte-determinism
under pdfkit on Bun IS feasible once B-01 (drop the embedded font) and B-02
(pin dates at construction so `/ID` is deterministic) are applied.

---

# Pass 2 (FINAL — 2-pass cap)

- artifact: `design.md` + `tasks.md` (status: **revised**)
- reviewer: spec-review-agent
- review_pass: **2 of max 2 (final)**
- reviewed_at: 2026-07-04
- verdict: **approve**

Re-reviewed cold against the revised `design.md`/`tasks.md`, the pdfkit
upstream source (`lib/security.js` `generateFileID`, `lib/document.js`
constructor + `_finalize`), and the pass-1 findings. Every pass-1 finding
(B-01, B-02, C-01..C-05, N-01..N-03) is genuinely resolved. No new
correctness problem introduced. The two blockers — the load-bearing ones —
are fixed correctly and confirmed against pdfkit's actual code.

## Pass-1 findings — verification

### ~~B-01~~ → resolved (vendored font gone; standard-14 Courier)

Grepped `assets/fonts`, `registerFont`, `.ttf`, `embedFont` across
`design.md` + `tasks.md`: **every remaining hit is a negation** ("**no**
`registerFont`, **no** embedded font, **no** vendored TTF asset";
§7.4 "**None.** … the earlier `api/assets/fonts/` vendored-TTF row is
**removed**"). DD-03 and §5.3 step 5 now specify `doc.font("Courier")`
(standard-14, non-embedded — "no font stream in the PDF at all"). T-05's
Files list carries no font asset and states "No `api/assets/fonts/` asset".
The single biggest nondeterminism source (font-subset ordering) is removed,
strengthening AC-08.

### ~~B-02~~ → resolved (load-bearing — `/ID` deterministic; verified vs pdfkit source)

Confirmed against pdfkit upstream:
- `PDFSecurity.generateFileID(info)` hashes `info.CreationDate.getTime()`
  first, then iterates **every** info key (`Producer`/`Creator`/`ModDate`/…)
  into the MD5 — matches the design's claim verbatim.
- `this._id = PDFSecurity.generateFileID(this.info)` runs **in the
  constructor**, after `this.info` is seeded with defaults (`CreationDate:
  new Date()`) and merged with `options.info`.
- `_finalize()` writes `ID: [this._id, this._id]` into the trailer.

The revised DD-03 + §5.3 pass `CreationDate`/`ModDate`/`Producer`/`Creator`
via the **constructor `info` option** — `new PDFDocument({ …, info:{
CreationDate:new Date(0), ModDate:new Date(0), Producer:"companygraph",
Creator:"companygraph" } })` — so `generateFileID` hashes fixed values and
`/ID` is a deterministic `md5(info)`. §5.3 step 2 explicitly warns "Do NOT
assign the dates post-construction". Only `/Subject` (the hash) is set
post-construction, and it does not feed `generateFileID` — correct.

Per-render-varying text audit: the render fn `renderExecSummaryPdf(snapshot)`
is pure w.r.t. its `snapshot` arg (§5.3 step 6/7 draw body + footer **only**
from the cache row's `last_run_at`/scores/hash; step 6 explicitly forbids
`Date.now()`/random/locale). The only `new Date()` in the PDF-adjacent code
is `scheduler.ts` line 367 (`lastRunAt = new Date().toISOString()`) — that is
the **precompute write path**, stamped once into `analytics_run` and read
back deterministically at render time; no wall clock reaches the PDF bytes on
render. AC-08(a) `deepEqual`s the **whole `Uint8Array`**, so `/ID` is covered
(design §5.3 test hook, §8, T-05 all state this); AC-08(b) mutates weights on
a **fresh** snapshot, avoiding any prune/determinism confusion. B-02 is
actually correct, not merely asserted.

### ~~C-01~~ → resolved
DD-10, §5.4, and T-01 all use the single-arg `withCacheEnvelope(body)`. The
two-arg `(report, result)` form is gone everywhere; DD-10 explicitly notes
the alignment.

### ~~C-02~~ → resolved
The two "no auth code paths" mentions (design §1 line 42, §10 line 542) are
now framed as the **retired** rule ("is not invoked", "was retired in the
2026-07-04 adoption"), matching `.claude/CLAUDE.md`. DD-09 reworded to the
central-router-gate + sentinel-actor phrasing recommended in pass 1.

### ~~C-03~~ → resolved (real prune write-path + task + pruned-run 404)
DD-12 is now a first-class decision with the prune SQL (`UPDATE
analytics_run SET nodes_json='', edges_json='' WHERE last_run_at NOT IN
(… ORDER BY last_run_at DESC LIMIT 7)`). §5.4 exports `SNAPSHOT_RETENTION=7`
+ `pruneSnapshots()`; §5.6 calls it as the last step of `writeRun()`; §5.7 +
§6 define pruned-run → `404 not_found`. Tasks: T-01 exports the helpers with
a prune unit test (write 8 runs → oldest blob empty, latest 7 intact); T-04
calls `pruneSnapshots()` in `writeRun()`; T-06 tests the pruned-run 404.
Self-prune is impossible (the current run holds the max `last_run_at`, so it
is always inside the retained top-7).

### ~~C-04~~ → resolved
Zero `attributes_parsed` remnants. `HashNode`/`HashEdge` (§5.1) and
`capture.ts` (§5.2) use `attributes`, matching NFR-05 rule (d)'s stated key
so an external verifier reproduces the exact serialised form.

### ~~C-05~~ → resolved
`normalizeString()` does `.replace(/\r\n/g,"\n").normalize("NFC")` (rule g
then f) applied recursively via `nfc()` before `canonicalStringify`. AC-09's
test (§8 + T-02 case f) adds an explicit rule-(g) case: a string **value**
with `\r\n` vs `\n` → same hash.

### ~~N-01~~ → resolved
`api/__tests__/analytics-cache.test.ts` now appears in §7.5 and is
cross-referenced in T-01's Verification.

### ~~N-02~~ → resolved
`analytics_run.status` DDL carries `CHECK (status IN ('ok','ai_skipped'))`
(§5.4 + T-01).

### ~~N-03~~ → resolved
§5.6 + T-04 pin the resolution: import ontology-manager's schema-cache
accessor **directly, in-process — no HTTP**.

## New findings

None. No new correctness problem in the revision. Two non-blocking notes
carried to build (cap reached — no further review loop):

- **Note A (build-time):** T-08's `depends_on` lists `T-09` (router mount) for
  the *live* download while also saying "the view + test can land before the
  mount using a fetch mock". That is an intentional soft dependency, not a
  cycle (T-09 depends on T-05/T-06/T-03, never on T-08) — the executor should
  land T-08's view/test against a mock and defer the live-download manual check
  until after T-09. Harmless; flagged only so the ordering isn't read as
  circular.
- **Note B (build-time):** AC-08(b)'s "mutate weights, re-render on a **fresh**
  snapshot" is correct, but the executor must ensure the weight-mutation test
  builds a *new* `analytics_run` row (or an in-memory `HashInput`) rather than
  reusing a pruned run's cleared blob — the design already implies this ("fresh
  snapshot"), just confirm in the test.

## Verdict

**approve.** All three OQs are decided law; both blockers are fixed and
independently confirmed against pdfkit's actual `generateFileID`/constructor/
`_finalize` code — byte-determinism including the trailer `/ID` is genuinely
achievable as designed, with no wall-clock value reaching the PDF bytes on
render. All five concerns and three nits are applied. This is an as-designed
spec ready to build. Two build-time notes carried forward (cap reached);
neither is a blocker.
