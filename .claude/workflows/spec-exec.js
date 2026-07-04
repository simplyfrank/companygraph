export const meta = {
  name: 'spec-exec',
  description:
    'Execute an approved spec\'s BUILD tasks in dependency order with per-task implement→independent-verify gates (typecheck + unit tests + design-conformance). Auto-approve = a fresh verifier re-runs the deterministic gates and confirms the DoD; blocked tasks are reported, never force-completed.',
  phases: [{ title: 'Foundation' }, { title: 'Build' }],
}

// ---------------------------------------------------------------------------
// Executes the BUILD tasks of ONE approved spec. Input (inline into this script
// per the /spec-app load-bearing lesson: named-workflow args don't propagate;
// launch via the `script` parameter):
//   args = { spec, order:[taskId...], foundational:[taskId...] }
// Tasks run SERIALLY in `order` — this both respects the dependency spine and
// serializes writers of shared files (router.ts, route.ts, views/index.tsx,
// tokens.css) so parallel agents never corrupt the working tree.
//
// Per task: implement (spec-author, spec-workflow Phase 5) → verify
// (spec-reviewer, NO Edit tool — re-runs the gates + reads the diff). The
// verifier's deterministic re-run is the auto-approve gate. Up to
// MAX_FIX_ROUNDS fix passes; then the task is marked blocked and surfaced.
// If a FOUNDATIONAL task ends blocked, stop — its dependents cannot succeed.
//
// The spec Write/Edit hooks (spec-guard/gate/traceability/completion) gate every
// file write automatically because the agents run in-repo. Agents do NOT set the
// spec's Execution phase to complete — the orchestrator does that after the full
// suite passes.
// ---------------------------------------------------------------------------

let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (_e) { a = {} } }
const SPEC = a?.spec
const ORDER = Array.isArray(a?.order) ? a.order : []
const FOUNDATIONAL = new Set(a?.foundational ?? [])
if (!SPEC || !ORDER.length) {
  throw new Error('spec-exec: args.spec and non-empty args.order are required (inline them into the script body and relaunch via the `script` parameter)')
}

const MAX_FIX_ROUNDS = 2

const EXEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['complete', 'blocked'] },
    typecheck: { type: 'string', enum: ['pass', 'fail'] },
    tests: { type: 'string', enum: ['pass', 'fail', 'not-run'] },
    conformance: { type: 'string', enum: ['pass', 'fail', 'n/a'] },
    files_touched: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['status', 'typecheck', 'summary'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    passed: { type: 'boolean' },
    typecheck: { type: 'string', enum: ['pass', 'fail'] },
    tests: { type: 'string', enum: ['pass', 'fail', 'not-run'] },
    conformance: { type: 'string', enum: ['pass', 'fail', 'n/a'] },
    dod_met: { type: 'boolean' },
    blockers: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['passed', 'typecheck', 'dod_met', 'notes'],
}

const RD = [
  'Honor the design decisions in this spec\'s design.md (its §10 Resolved Decisions / RD-* and its DD-* rows are binding) — read them and implement to them exactly. Load-bearing invariants that apply repo-wide:',
  '- NO direct getDriver()/driver.session() anywhere under api/src/analytics/; all Neo4j reads go through the shared read-only module (api/src/neo4j/read-only-*.ts). The AC-11 guard test greps for this.',
  '- pwa chart/UI colors are var(--…) tokens, never hardcoded hex (design-conformance enforces this on touched pwa views); routes come from the design/View-Tree verbatim.',
  '- If the design states a DETERMINISM / byte-reproducibility requirement (e.g. a deterministic PDF or graph-state hash — same input must yield byte-identical output), implement it EXACTLY as the design specifies (e.g. fixed PDF metadata via the PDFDocument constructor info option, no wall-clock/Date.now() reaching the output, canonical JSON ordering). Its test asserts byte-equality — do not approximate.',
  '- House rules (CLAUDE.md): en-US identifiers, zod-only validation, no tsc, NFR-08 error envelope, all REST under /api/v1/.',
].join('\n')

function implPrompt(t, fixNotes) {
  return [
    `Execute task ${t} of the approved spec ${SPEC}, following .claude/skills/spec-workflow/SKILL.md Phase 5 (Execute).`,
    `Read .claude/specs/${SPEC}/tasks.md for ${t}'s full definition (Files, Implements, Closes, Definition of Done) and .claude/specs/${SPEC}/design.md for the architecture + the §10 Resolved Decisions. Read an existing sibling (e.g. api/src/routes/analytics.ts, pwa/src/views/analytics/Overview.tsx) for house patterns.`,
    RD,
    `Implement ONLY the files ${t} owns (other tasks own other files; never edit a file another task owns — if you must, stop and report status:"blocked").`,
    'GATES you must run and get green before returning status:"complete":',
    '  1. `bun run typecheck` (repo root) — MUST pass.',
    `  2. The task's unit tests: write them per the task's Verification, then \`bun test <files>\` — MUST pass. Integration tests that need a live seeded Neo4j: write them and run best-effort; if env-dependent, record their verification as "manual: <cmd>" rather than failing the task.`,
    '  3. For every touched pwa view: `bun run scripts/design-conformance.ts` — MUST pass (tokens-only, catalog components, routes from the view tree). If no pwa view is touched, conformance is n/a.',
    `Update .claude/specs/${SPEC}/tasks.md to check off ${t} and note the real Verification artifact (test path, or "manual: <repro>"). Do NOT set the spec's Execution phase to complete — that is the orchestrator's job after the full suite passes.`,
    fixNotes ? `\nThis is a FIX pass — the independent verifier rejected the prior attempt. Address every one of these and re-run the gates:\n${fixNotes}` : '',
    'Return the EXEC_SCHEMA object: honest status, gate results, files_touched, blockers, one-line summary.',
  ].filter(Boolean).join('\n\n')
}

function verifyPrompt(t) {
  return [
    `You are an INDEPENDENT verifier for task ${t} of spec ${SPEC}. You did not write the code. You have no Edit tool — you only inspect and run gates.`,
    `Read ${t}'s definition + Definition of Done in .claude/specs/${SPEC}/tasks.md and the §10 Resolved Decisions in design.md.`,
    RD,
    'Re-run the deterministic gates yourself (do not trust the implementer\'s claim):',
    '  1. `bun run typecheck` (repo root).',
    `  2. \`git diff --name-only\` to see ${t}'s touched files; run the task's unit tests \`bun test <files>\`.`,
    '  3. If a pwa view was touched: `bun run scripts/design-conformance.ts`.',
    'Then read the diff of the touched files and confirm: the DoD is met; the RD decisions are honored (grep the touched api/src/analytics files for getDriver()/driver.session() → MUST be absent per RD-1; grep touched views for hardcoded hex colors like #22c55e → MUST be absent per RD-5); no file outside the task\'s ownership was changed.',
    'passed = (typecheck pass) AND (tests pass or justified-manual) AND (conformance pass or n/a) AND dod_met AND RD honored. Be strict: default passed=false if any gate is red or any RD is violated. List concrete blockers.',
    'Return the VERIFY_SCHEMA object.',
  ].join('\n\n')
}

function fixNotesFrom(v) {
  const parts = []
  if (v?.typecheck === 'fail') parts.push('- typecheck is RED')
  if (v?.tests === 'fail') parts.push('- tests are RED')
  if (v?.conformance === 'fail') parts.push('- design-conformance is RED (detokenize / catalog / routes)')
  if (v?.dod_met === false) parts.push('- Definition of Done not met')
  for (const b of v?.blockers ?? []) parts.push(`- ${b}`)
  return parts.join('\n') || (v?.notes ?? 'verifier rejected without detail')
}

const results = []
let foundationBroke = null

for (const t of ORDER) {
  const phase = FOUNDATIONAL.has(t) ? 'Foundation' : 'Build'
  let impl = await agent(implPrompt(t), { agentType: 'spec-author', schema: EXEC_SCHEMA, label: `impl:${t}`, phase })
  let verdict = await agent(verifyPrompt(t), { agentType: 'spec-reviewer', schema: VERIFY_SCHEMA, label: `verify:${t}`, phase })

  let round = 1
  while (verdict && verdict.passed !== true && round <= MAX_FIX_ROUNDS) {
    log(`spec-exec: ${t} rejected (round ${round}) — ${fixNotesFrom(verdict).replace(/\n/g, '; ')}`)
    impl = await agent(implPrompt(t, fixNotesFrom(verdict)), { agentType: 'spec-author', schema: EXEC_SCHEMA, label: `fix:${t}:${round}`, phase })
    verdict = await agent(verifyPrompt(t), { agentType: 'spec-reviewer', schema: VERIFY_SCHEMA, label: `reverify:${t}:${round}`, phase })
    round++
  }

  const passed = verdict?.passed === true
  results.push({
    task: t,
    passed,
    typecheck: verdict?.typecheck ?? impl?.typecheck ?? 'unknown',
    tests: verdict?.tests ?? impl?.tests ?? 'unknown',
    conformance: verdict?.conformance ?? impl?.conformance ?? 'unknown',
    summary: impl?.summary ?? '',
    blockers: passed ? [] : (verdict?.blockers ?? impl?.blockers ?? ['verifier returned no verdict']),
  })
  log(`spec-exec: ${t} → ${passed ? 'PASS' : 'BLOCKED'}`)

  if (!passed && FOUNDATIONAL.has(t)) {
    foundationBroke = t
    log(`spec-exec: foundational task ${t} is BLOCKED — stopping; dependents cannot succeed. Surfacing partial results.`)
    break
  }
}

return {
  spec: SPEC,
  foundationBroke,
  planned: ORDER.length,
  ran: results.length,
  passed: results.filter((r) => r.passed).map((r) => r.task),
  blocked: results.filter((r) => !r.passed).map((r) => ({ task: r.task, blockers: r.blockers })),
  results,
}
