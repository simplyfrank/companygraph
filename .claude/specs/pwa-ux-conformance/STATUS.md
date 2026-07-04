# Spec: pwa-ux-conformance
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: approved — execution deferred

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 2) | review-spec.md pass 2 | 2026-07-04 |
| Req Review | approve (full-spec review-spec.md, pass 2) | - | 2026-07-04 |
| Design | approved (rev 2) | review-spec.md pass 2 | 2026-07-04 |
| Design Review | approve with notes (pass 2: 0 blockers; pass-1 5 concerns + 3 nits all resolved; 1 must-carry concern C2-01) | - | 2026-07-04 |
| Tasks | approved (rev 2) | review-spec.md pass 2 | 2026-07-04 |
| Task Review | approve (full-spec review-spec.md, pass 2) | - | 2026-07-04 |
| Execution | not started — deferred until the studio build lands (see requirements §Dependencies) | - | - |

**review_passes**: 2 (cap reached)

**Must-carry into execution (review pass-2 C2-01):** design §9's gesture
verify-vs-fix matrix mislabels three in-scope canvas surfaces
(`explorer/JourneyGraph`, `components/JourneyCanvas`, `components/GraphCanvas`)
as `verify-only` claiming `touch-action:none` is present — a live grep shows it
is **absent** (only `user-select:none`). Treat the §9 current-state column as
untrusted: the implementer must re-grep and **add `touch-action: none`
(+ `overscroll-behavior-y: contain`) to those three `.module.css` files**, with
AC-04 `canvas-gestures.ipad.spec.ts` as the backstop. DD-09/T-09 are grep-gated
so this self-corrects, but do not skip it.

**Revision 2 (2026-07-04)** — addresses every Blocker + Concern in
`review-spec.md`:
- **B-01**: re-ran `design-conformance.ts` across all 198 in-scope files;
  true failing set is **55 files to remediate** (16 view `.tsx` + 10 view
  `.module.css` + 28 shared `components/**` + 1 `styles/chat.css`) plus
  the waived auto-generated `tokens.css` (56 flagged in total), each
  given a concrete fix in design §5/§5b. FR-07/AC-03 now gate the real
  set.
- **B-02**: split the two ~73-file mega-tasks — ARIA (T-06) and
  view-states (T-07) — into **one task per surface** (T-06a..i, T-07a..i)
  and the token sweep into per-surface T-04a..g, each ≤3-file batches
  with its own `git diff` behavior check.
- **B-03**: corrected view count **73 → 70** everywhere (design §4 sums
  to 70, matches live tree).
- **C-01**: added verify-vs-fix matrices (design §9 gestures, §10 nav).
- **C-02**: token edits now target the *source* `design-system.yaml` +
  regenerate; ramp OKLCH values + per-hex mapping pinned in §5d (OQ-1
  resolved: named ramps, swatches kept distinct).
- **C-03**: sweep uses recursive `find`, reaches `components/charts/`,
  waives `tokens.css`.
- **C-04**: per-view state matrix now exists in design §5c.
- **C-05**: `no-auth-grep` reframed as a secondary pwa-layer guard; `git
  diff` scope check is primary (design §8b).
- Nits N-01/N-02/N-03 addressed.

**Verification:**
- `verified_at`: —  ← required when Execution is `complete`
- `verification_artifact`: —  ← required when Execution is `complete`

**Artifacts:**
- 📄 Requirements: `.claude/specs/pwa-ux-conformance/requirements.md`
- 📄 Design: `.claude/specs/pwa-ux-conformance/design.md`
- 📄 Tasks: `.claude/specs/pwa-ux-conformance/tasks.md`
- 📝 Reviews: `.claude/specs/pwa-ux-conformance/review-spec.md` (pass 1: revise; pass 2: approve with notes)

**Scope note:** Conformance REMEDIATION, not a rewrite (user decision
2026-07-04). Owns the pre-studio views under
`pwa/src/views/{explorer,chat,ontology,sme,analytics,api,exec,data,admin}/`
+ shared primitives. Does NOT own `pwa/src/views/model/**` or
`#/exec/performance` (studio feature specs). Makes no `route.ts`/
`index.tsx`/`api/`/`shared/` changes.

**Next**: Approved and execution-ready. Execution is deferred until the
Business Modeling Studio build lands (so the final full-PWA conformance sweep
also covers the finished `model/**` views, read-only). When the working tree is
confirmed idle, execute via `/spec-exec pwa-ux-conformance` (or a spec-exec
pass): 33 tasks, per-surface, each gated by `git diff` behavior-preservation +
`design-conformance.ts --view`. Carry the C2-01 canvas `touch-action` note.
