export const meta = {
  name: 'spec-backfill',
  description:
    'Backfill as-built traceability on FAIL specs — one spec-author per spec, in parallel. Spec-doc edits ONLY (no code), each agent confined to its own .claude/specs/<slug>/ dir so the fan-out is collision-free and does not race a concurrent code-writing session.',
  phases: [{ title: 'Backfill' }],
}

let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (_e) { a = {} } }
const SPECS = Array.isArray(a?.specs) ? a.specs : []
if (!SPECS.length) {
  throw new Error('spec-backfill: args.specs must be a non-empty array (inline it into the script and relaunch via the `script`/`scriptPath` parameter)')
}

const RESULT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    spec: { type: 'string' },
    green: { type: 'boolean' },
    before_gaps: { type: 'number' },
    after: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['spec', 'green', 'summary'],
}

function backfillPrompt(spec) {
  return [
    `Backfill AS-BUILT traceability on the spec .claude/specs/${spec}/ so that ` +
      `\`scripts/spec/spec-traceability.sh .claude/specs/${spec}\` prints OK (exit 0). This is an as-built ` +
      `documentation backfill of already-shipped work — reflect REALITY, never invent work, and never ` +
      `renumber existing FR/AC/DD/T IDs. Touch ONLY files under .claude/specs/${spec}/ (do not edit code, ` +
      `other specs, or shared files — a concurrent session owns the rest of the tree).`,
    `Run \`scripts/spec/spec-traceability.sh .claude/specs/${spec}\` to see the gaps, then fix each one reality-first:`,
    `- "FR-xx never reaches design.md / tasks.md": read the FR, grep the codebase (api/src, pwa/src, shared/src, ` +
      `and the tests) for its implementation, and add the FR reference to the design element / task that actually ` +
      `implemented it. If it was genuinely NOT built, mark the FR \`priority: deferred\` (stable-ID rule — never ` +
      `delete) with a one-line rationale and note it as open scope.`,
    `- "AC-xx has no closing task": map it to the existing task that satisfied it (add the AC to that task's ` +
      `Closes/citation), or add ONE ratification task at the next free T-number (modeled on ` +
      `.claude/specs/_baseline/tasks.md) citing the real files/tests that satisfy it as-built.`,
    `- "task T-xx has no Verification": add a Verification line naming the REAL test path (grep api/__tests__, ` +
      `**/*.test.ts, **/*.test.tsx for the task's functionality) or, when no test exists, an honest ` +
      `\`manual: <one-line repro with an observable outcome>\`.`,
    `Verify every claim against the actual code before writing it. Follow companygraph house format ` +
      `(read .claude/specs/_baseline/ or graph-core/ as the worked example). Append a STATUS.md changelog note ` +
      `"2026-07-05: as-built traceability backfill". Do NOT change any phase status. Re-run the script until it prints OK.`,
    `Return {spec, green (true iff the script prints OK), before_gaps (the initial gap count), after (the final ` +
      `script summary line), summary (one line: what you fixed / what you deferred)}.`,
  ].join('\n\n')
}

const results = await parallel(
  SPECS.map((spec) => () =>
    agent(backfillPrompt(spec), { agentType: 'spec-author', schema: RESULT, label: `backfill:${spec}`, phase: 'Backfill' })
      .then((r) => r ?? { spec, green: false, summary: 'agent returned no result (skipped or died)' }),
  ),
)

const clean = results.filter(Boolean)
return {
  planned: SPECS.length,
  green: clean.filter((r) => r.green).map((r) => r.spec),
  still_failing: clean.filter((r) => !r.green).map((r) => ({ spec: r.spec, summary: r.summary })),
  results: clean,
}
