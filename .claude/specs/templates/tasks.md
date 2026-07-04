---
feature: "<slug>"
created: "<YYYY-MM-DD>"
author: "<who>"
status: "draft"
revision: 1
reviewing_requirements_revision: <N>
reviewing_design_revision: <N>
size: "<small|medium|large>"
total_tasks: <N>
---

# Tasks: <slug>

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocks` / `Blocked by`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h with one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` or `pwa/src/components/` additionally run
  `bun run scripts/design-conformance.ts --view <file>`.

## Open design concerns — pinned decisions
<!-- Only when design review left open concerns (C-xx) for the tasks author to
     pin. The decisions here are binding for execution. Delete otherwise. -->

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|

## Task list

### T-01 — <title>

- **Files** (<N>): `<path>` (new/modify), …  <!-- 1–3 files per task -->
- **Implements**: <design section §x.y> — closes AC-xx, AC-yy
- **Complexity**: simple | moderate | complex
- **Blocked by**: — | T-xx
- **Blocks**: T-xx
- **Steps**: <what to do, concretely — the implementer should not need to
  re-derive decisions>
- **Verification**: `<path>.test.ts` | manual: <repro with input mode +
  observable outcome>

### T-02 — <title>

…

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views | `bun run scripts/design-conformance.ts --view <file>` |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC sweep |
