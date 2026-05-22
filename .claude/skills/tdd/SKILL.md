# TDD Verification Skill

Test-driven development workflow: write failing acceptance tests FIRST as the specification, get user approval, then implement to green.

## Usage

- `/tdd <feature>` — Start a new TDD session (Phase 1: Analyze)
- `/tdd verify` — Re-run the test harness for the current/last session
- `/tdd status` — Show active TDD sessions and their phase
- `/tdd evolve <feature>` — Update an existing feature's test harness, then re-implement

## The 5-Phase Gated Workflow

```
Phase 1: Analyze → [User approves AC] →
Phase 2: RED (write failing tests) → [User approves harness] →
Phase 3: GREEN (implement) →
Phase 4: Regression check →
(done)
```

Phases 1 and 2 have **hard gates** — you MUST wait for user approval before proceeding.

---

## Phase 1 — Analyze

Parse the feature request and explore the codebase to understand what's affected.

### Steps

1. **Parse the feature** — Extract the core requirement, identify inputs/outputs, list affected modules.
2. **Explore affected modules** — Read each file that will be created or modified. Note existing exports, schemas, and integration points.
3. **Classify each module** using the `test/` skill's decision tree (Templates A-F):
   - `src/memory/*` → Template A (Memory Module)
   - `src/cloud/*` → Template B (Cloud Service)
   - `src/actions/*` → Template C (Action Handler)
   - `src/webapp/routes/*` → Template D (Route Handler)
   - `src/shared/*`, `src/utils/*` → Template E (Pure Logic)
   - `src/subagents/*` → Template F (Subagent)
   - `src/local/*` → Template C or E depending on side effects
4. **Produce an acceptance criteria (AC) table**:

```markdown
| # | Acceptance Criterion | Module | Template | Test File |
|---|---------------------|--------|----------|-----------|
| 1 | Description of what must be true | src/path/module.ts | A | src/path/module.test.ts |
| 2 | ... | ... | ... | ... |
```

### Gate: Present the AC table to the user

Show the AC table and ask: **"Does this acceptance criteria table capture what you want? Approve to proceed to test writing, or suggest changes."**

Do NOT proceed to Phase 2 until the user explicitly approves.

---

## Phase 2 — Write Failing Tests (RED)

Write test files that define the specification. Every AC row becomes one or more `test()` blocks.

### Rules

1. **Use `test/` skill templates** for mock setup — reference Templates A-F from `.claude/skills/test/SKILL.md`. Do NOT reinvent mock patterns.
2. **Tests must be syntactically valid** — they must parse and run without import/syntax errors.
3. **Tests must fail on `expect()` assertions** — NOT on missing imports, missing modules, or syntax errors. This means:
   - If testing a NEW module that doesn't exist yet, create a **minimal stub** with the right exports returning placeholder values (empty arrays, `null`, `undefined`, `false`).
   - Stub file should be just enough for imports to resolve — no real logic.
4. **Run each test file individually** to confirm RED:
   ```bash
   cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun test src/path/module.test.ts
   ```
5. **Run files separately** — never run the full suite during Phase 2 (avoids `mock.module` cross-contamination between files).
6. **Report results** as a table:

```markdown
| Test File | Total | Pass | Fail | Status |
|-----------|-------|------|------|--------|
| src/path/module.test.ts | 5 | 0 | 5 | RED |
| src/path/other.test.ts | 3 | 0 | 3 | RED |
```

All tests MUST be RED (0 pass). If any test passes, the stub is too complete — strip it back.

### Gate: Present the test harness to the user

Show the test files and results table. Ask: **"These failing tests define the specification. Approve to start implementation, or suggest changes to the test harness."**

The user is the final arbiter on the test harness. Do NOT proceed to Phase 3 until explicitly approved.

---

## Phase 3 — Implement (GREEN)

Write production code to make all tests pass. Only start after Phase 2 approval.

### Steps

1. **Order modules by dependency** — implement leaf dependencies first (memory modules before cloud services, cloud services before actions/routes).
2. **For each module**:
   a. Write/modify the production code.
   b. Run transpile check: `cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun build src/cloud/relay.ts --no-bundle > /dev/null 2>&1`
   c. Run that module's test file individually.
   d. Report progress: `[3/8 tests passing]`
3. **After all modules are implemented**, run every test file from Phase 2 individually and report:

```markdown
| Test File | Total | Pass | Fail | Status |
|-----------|-------|------|------|--------|
| src/path/module.test.ts | 5 | 5 | 0 | GREEN |
| src/path/other.test.ts | 3 | 3 | 0 | GREEN |
```

All tests MUST be GREEN. If any fail, fix the implementation (not the tests) until green.

### No gate — proceed directly to Phase 4.

---

## Phase 4 — Regression Check

Run ALL existing test files to catch breakage from the new implementation.

### Steps

1. **Find all test files**:
   ```bash
   cd /Users/frank/Documents/coding/personalassistant/telegram && find src -name "*.test.ts" -not -path "*node_modules*" | sort
   ```
2. **Run each file individually** (same pattern as pre-push hook — avoids mock contamination):
   ```bash
   cd /Users/frank/Documents/coding/personalassistant/telegram && /Users/frank/.bun/bin/bun test src/path/file.test.ts
   ```
3. **Report results**:

```markdown
| Test File | Result |
|-----------|--------|
| src/memory/finance.test.ts | PASS |
| src/cloud/__tests__/scheduler.test.ts | PASS |
| src/path/new-feature.test.ts | PASS |
| ... | ... |

Summary: 12/12 passed, 0 failed
```

4. **If any EXISTING test fails** (not one from Phase 2), fix the regression before declaring done.

### Never skip regression check.

---

## Phase 5 — Maintenance (`/tdd evolve <feature>`)

When requirements change for an existing feature:

1. **Find existing test files** for the feature.
2. **Update the AC table** — add/modify/remove criteria.
3. **Update test files** — add new failing tests for new criteria, modify existing tests for changed criteria.
4. **Confirm RED** for new/changed tests only.
5. **Gate**: User approves the updated test harness.
6. **Implement** changes (Phase 3 rules apply).
7. **Regression check** (Phase 4 rules apply).

---

## `/tdd verify`

Re-run the test harness from the most recent TDD session:

1. Find all test files created/modified in the session.
2. Run each individually.
3. Report pass/fail table.

---

## `/tdd status`

Show active TDD sessions:

```markdown
| Feature | Phase | Tests | Passing | Last Updated |
|---------|-------|-------|---------|--------------|
| feature-name | GREEN (Phase 3) | 8 | 5/8 | 2 min ago |
```

---

## Key Rules

1. **NEVER write implementation before test harness is approved.** This is the core invariant of the workflow.
2. **Failing tests must fail on `expect()` assertions**, not syntax/import errors. Create minimal stubs for new modules.
3. **Reuse `test/` skill templates A-F** for mock setup. Read `.claude/skills/test/SKILL.md` for the patterns — don't reinvent them.
4. **Run each test file separately** — `mock.module()` calls in one file can contaminate another if run together.
5. **Always run regression check** (Phase 4) — never skip it.
6. **User is final arbiter** on the test harness. If they want changes, update the tests before implementing.
7. **Stubs are throwaway** — minimal stubs created in Phase 2 get replaced entirely in Phase 3.
8. **Progress reporting** — after each module implementation, report N/M tests passing so the user can track progress.

## Relationship to `test/` Skill

| Concern | `test/` skill | `tdd/` skill |
|---------|---------------|--------------|
| Purpose | Generate tests for existing code | Workflow: tests-first, then implement |
| When | After code exists | Before code exists |
| Templates | Owns A-F mock templates | References them (never duplicates) |
| Approval gate | None | Central — Phase 1 (AC) and Phase 2 (harness) |
| Stubs | Not needed (code exists) | Creates minimal stubs for import resolution |
| Regression | Optional | Mandatory (Phase 4) |
