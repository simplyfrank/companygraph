export const meta = {
  name: 'spec-app',
  description:
    'Drive each feature of an application through companygraph’s spec pipeline (requirements → design → tasks) in parallel, foundation tier first, reusing the spec-workflow + spec-review conventions',
  phases: [
    { title: 'Requirements' },
    { title: 'Design' },
    { title: 'Tasks' },
    { title: 'Execute' },
  ],
}

// ---------------------------------------------------------------------------
// Input: args = { app: "<slug>",
//                 implement?: true,   // single-shot mode: spec THEN build each feature
//                 features: [ { slug, name, tier, priority, depends_on, scope,
//                               size? }, ... ] }
// The feature list + app slug come from the /spec-app orchestrator's decompose
// pass (it writes .claude/specs/blueprint.md first). See
// .claude/skills/spec-app/SKILL.md.
//
// This is the COMPANYGRAPH port of docorg's spec-app workflow. Author/review
// agents are companygraph's OWN agent types (.claude/agents/spec-author.md and
// spec-reviewer.md) — thin role wrappers around companygraph's spec skills
// (.claude/skills/spec-workflow/SKILL.md to author, .claude/skills/spec-review/
// SKILL.md to review) and house format. We reuse the existing infra; we do not
// import a parallel spec system. The spec-reviewer agent deliberately has NO
// Edit tool, so a reviewer can never modify the artifact it judges. The spec
// Write/Edit hooks (spec-gate-check, spec-traceability-check, spec-guard,
// spec-completion-check) apply to all these agents automatically because they
// run in-repo.
//
// Produces, per feature, the standard companygraph artifacts under
//   .claude/specs/<slug>/ : requirements.md, design.md, tasks.md,
//                           review-<phase>.md, STATUS.md
// (the agents do the file writes — workflow scripts have no FS access).
// ---------------------------------------------------------------------------

// Tolerate args arriving as a JSON string (some launch paths stringify it).
let parsedArgs = args
if (typeof parsedArgs === 'string') {
  try { parsedArgs = JSON.parse(parsedArgs) } catch (_e) { parsedArgs = {} }
}

const app = parsedArgs?.app ?? 'app'
// Single-shot mode: after a feature's spec is complete, an implementer agent
// executes its tasks (spec-workflow Phase 5) inside the same dependency wave.
// Set by the /spec-app orchestrator only after the user approved the blueprint
// in single-shot mode — that approval is the authorization to write code.
const implement = parsedArgs?.implement === true
const features = Array.isArray(parsedArgs?.features) ? parsedArgs.features : []
if (!features.length) {
  throw new Error(
    'spec-app workflow: args.features must be a non-empty array (run the decompose pass first). ' +
      'If launched by name and args did not propagate, inline app+features into the script body and ' +
      'relaunch via the `script` parameter.',
  )
}

// A spec-review verdict, structured so the script can branch on it.
// Matches companygraph's spec-review vocabulary (approve / revise / reject;
// "approve with notes" = approve + open concerns).
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['approve', 'revise', 'reject'] },
    blockers: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'summary'],
}

// Outcome of a single-shot execution pass, structured for the Phase C report.
const EXEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['complete', 'blocked'] },
    typecheck: { type: 'string', enum: ['pass', 'fail'] },
    tests: { type: 'string', enum: ['pass', 'fail', 'not-run'] },
    conformance: { type: 'string', enum: ['pass', 'fail', 'n/a'] },
    blockers: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['status', 'summary'],
}

// companygraph HARD CAP: 1 initial review + at most 1 re-review after fixes
// (see spec-workflow/SKILL.md "HARD CAP: 1 review per phase, max 1 re-review").
const MAX_REVIEW_PASSES = 2

// companygraph size rules (spec-workflow/SKILL.md):
//   small  : requirements → tasks → execute   (NO design, NO reviews)
//   medium : requirements(review) → design(review) → tasks(no review)
//   large  : requirements(review) → design(review) → tasks(review)
function normalizeSize(f) {
  const s = String(f.size ?? 'medium').toLowerCase()
  return s === 'small' || s === 'large' ? s : 'medium'
}
function hasDesign(size) { return size !== 'small' }
function reviewed(size, kind) {
  if (size === 'small') return false
  if (kind === 'requirements' || kind === 'design') return true
  if (kind === 'tasks') return size === 'large'
  return false
}

function featureContext(f, size) {
  return [
    `Application: ${app}.`,
    `Feature: "${f.name}" (slug: ${f.slug}, tier: ${f.tier ?? 'feature'}, priority: ${f.priority ?? 'must'}, size: ${size}).`,
    f.depends_on?.length ? `Depends on: ${f.depends_on.join(', ')}.` : 'Depends on: none.',
    f.scope ? `Scope: ${f.scope}` : '',
    `Read .claude/CLAUDE.md for the architecture and the house rules every spec must honour ` +
      `(en-US identifiers, zod-only validation, no tsc, loopback binding, auth via the central ` +
      `router gate + api/src/auth/ — never per-route auth, REST under /api/v1/).`,
    `Read .claude/specs/blueprint.md for app-level architecture and the cross-cutting decisions (XD-*) every spec must honour. ` +
      `The blueprint's View Tree and UI/UX Allowances (UX-*) are law for any pwa/ work: take routes and view ` +
      `names from the View Tree VERBATIM (never invent or rename a route) and satisfy every UX-* allowance ` +
      `(view states, tokens-only styling via var(--…), catalog components first, a11y, input modes) in the ACs.`,
    `Read an existing spec under .claude/specs/ (e.g. graph-core) as the worked example of house format.`,
    f.depends_on?.length
      ? `Read the specs of dependencies (.claude/specs/<dep>/) and reference their real interfaces — do not re-invent them.`
      : '',
  ].filter(Boolean).join(' ')
}

// Author one artifact, then (when the size rules call for it) review/revise
// until no blockers or the 2-pass cap is hit. Authoring follows
// spec-workflow/SKILL.md; review follows spec-review/SKILL.md.
async function authorAndReview(f, size, kind, phaseTitle) {
  const ctx = featureContext(f, size)

  await agent(
    `${ctx}\n\nAct as the spec author. Author .claude/specs/${f.slug}/${kind}.md following ` +
      `.claude/skills/spec-workflow/SKILL.md (the ${kind} phase) and companygraph house format. ` +
      `Use stable IDs (FR-/AC-/DD-/T-) and full traceability (AC traces to FR; design file-changes ` +
      `serve an FR; tasks implement design + close ACs). ` +
      (kind === 'requirements'
        ? `If this feature touches pwa/, gestures, keyboard, or input handlers, the Platforms & Input Modes ` +
          `table and Native Conflicts table are REQUIRED; every Acceptance Criterion needs Platforms + ` +
          `Verification columns (a test path or "manual: <repro with input mode + observable outcome>"). `
        : '') +
      (kind === 'tasks'
        ? `Every task must carry a Verification field (a test path or "manual: <repro>") — the ` +
          `spec-completion hook rejects STATUS.md without it. `
        : '') +
      `Update .claude/specs/${f.slug}/STATUS.md per spec-workflow's STATUS.md format.`,
    { label: `author:${f.slug}:${kind}`, phase: phaseTitle, agentType: 'spec-author' },
  )

  if (!reviewed(size, kind)) {
    return { kind, verdict: 'unreviewed', blockers: [], summary: `${kind} authored (size=${size}, no review per house rules)` }
  }

  let review = null
  for (let pass = 1; pass <= MAX_REVIEW_PASSES; pass++) {
    review = await agent(
      `${ctx}\n\nAct as a FRESH spec reviewer (you did NOT author this). Review ` +
        `.claude/specs/${f.slug}/${kind}.md cold following .claude/skills/spec-review/SKILL.md. ` +
        `Write .claude/specs/${f.slug}/review-${kind}.md classifying findings as Blockers/Concerns/Nits, ` +
        `checking traceability against the upstream artifacts and the blueprint, and end with a verdict ` +
        `(approve / revise / reject). This is review pass ${pass} of at most ${MAX_REVIEW_PASSES}.`,
      { label: `review:${f.slug}:${kind}:${pass}`, phase: phaseTitle, agentType: 'spec-reviewer', schema: REVIEW_SCHEMA },
    )

    // approve / reject / null → stop. Only 'revise' loops (and only if a pass remains).
    if (!review || review.verdict !== 'revise' || pass === MAX_REVIEW_PASSES) break

    await agent(
      `${ctx}\n\nAct as the spec author. Revise .claude/specs/${f.slug}/${kind}.md to address every ` +
        `Blocker and Concern in .claude/specs/${f.slug}/review-${kind}.md. Note which finding each change ` +
        `resolves and bump the document status to "revised". Do NOT renumber existing stable IDs.`,
      { label: `revise:${f.slug}:${kind}:${pass}`, phase: phaseTitle, agentType: 'spec-author' },
    )
  }

  return { kind, verdict: review?.verdict ?? 'unknown', blockers: review?.blockers ?? [], summary: review?.summary ?? '' }
}

// Single-shot Execute stage: implement the feature's approved tasks in-repo.
// Runs INSIDE the dependency wave, so dependents build on real, built deps.
// In-wave features run concurrently in the same working tree — safe only via
// the blueprint rule that exactly one feature owns each file.
async function implementOne(f, size) {
  const ctx = featureContext(f, size)
  const result = await agent(
    `${ctx}\n\nAct as the implementer. Execute .claude/specs/${f.slug}/tasks.md following ` +
      `.claude/skills/spec-workflow/SKILL.md Phase 5 (Execute): implement every task in dependency order, ` +
      `touching ONLY the files this spec's design owns (other features are being built concurrently — ` +
      `never edit a file another spec owns; if you must, stop and report status "blocked" instead). ` +
      `After each task run \`bun run typecheck\` from the repo root. When all tasks are done run \`bun test\`, ` +
      `and for every touched pwa view run \`bun run scripts/design-conformance.ts --view <file>\` — fix ` +
      `failures before finishing; routes/components must match the blueprint View Tree and UX-* allowances. ` +
      `Then update .claude/specs/${f.slug}/STATUS.md: Execution complete with verified_at + ` +
      `verification_artifact per the completion hook (a test path or "manual: <repro with input mode + ` +
      `observable outcome>" for each AC).`,
    { label: `implement:${f.slug}`, phase: 'Execute', agentType: 'general-purpose', schema: EXEC_SCHEMA },
  )
  return result ?? { status: 'blocked', blockers: ['implementer agent returned no result'], summary: 'execution agent died or was skipped' }
}

// Full pipeline for a single feature. pipeline() means one feature can be in
// Design while another is still in Requirements. Small specs skip Design.
async function specOne(f) {
  const size = normalizeSize(f)
  const requirements = await authorAndReview(f, size, 'requirements', 'Requirements')
  const design = hasDesign(size)
    ? await authorAndReview(f, size, 'design', 'Design')
    : { kind: 'design', verdict: 'skipped', blockers: [], summary: 'small spec — design skipped per house rules' }
  const tasks = await authorAndReview(f, size, 'tasks', 'Tasks')

  let execution = null
  if (implement) {
    const rejected = [requirements, design, tasks].some((p) => p?.verdict === 'reject')
    execution = rejected
      ? { status: 'blocked', blockers: ['a spec phase ended in reject — not implementing'], summary: 'skipped: spec rejected' }
      : await implementOne(f, size)
  }

  return { f, size, requirements, design, tasks, execution }
}

async function specTier(tierFeatures) {
  return pipeline(tierFeatures, (f) => specOne(f))
}

// Split a set of features into dependency waves (topological layers),
// considering only depends_on edges that point WITHIN this set. A feature whose
// deps are all outside the set (already-planned tiers) or empty lands in wave 0.
function dependencyWaves(feats) {
  const inSet = new Set(feats.map((f) => f.slug))
  const remaining = [...feats]
  const placed = new Set()
  const waves = []
  while (remaining.length) {
    const ready = remaining.filter((f) =>
      (f.depends_on ?? []).every((d) => !inSet.has(d) || placed.has(d)),
    )
    if (!ready.length) {
      // Cycle / unsatisfiable dep — emit the rest as one wave rather than deadlock.
      log(`spec-app: dependency cycle among ${remaining.map((f) => f.slug).join(', ')} — running together`)
      waves.push(remaining.splice(0))
      break
    }
    ready.forEach((f) => placed.add(f.slug))
    waves.push(ready)
    for (const f of ready) remaining.splice(remaining.indexOf(f), 1)
  }
  return waves
}

// Run a tier as dependency-ordered waves: each wave is a barrier (dependents
// wait for deps to be fully specced), but specs within a wave pipeline freely.
async function specTierOrdered(tierFeatures, label) {
  const waves = dependencyWaves(tierFeatures)
  const out = []
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i]
    log(`${label}: wave ${i + 1}/${waves.length} — ${w.map((f) => f.slug).join(', ')}`)
    out.push(...(await specTier(w)))
  }
  return out
}

// ---------------------------------------------------------------------------
// Foundation tier first (a barrier) so dependent specs reference real
// interfaces; then the rest in parallel.
// ---------------------------------------------------------------------------
const foundation = features.filter((f) => f.tier === 'foundation')
const rest = features.filter((f) => f.tier !== 'foundation')

const results = []

if (foundation.length) {
  log(`Planning ${foundation.length} foundation spec(s) in dependency order: ${foundation.map((f) => f.slug).join(', ')}`)
  results.push(...(await specTierOrdered(foundation, 'Foundation')))
}

if (rest.length) {
  log(`Planning ${rest.length} feature spec(s) in parallel: ${rest.map((f) => f.slug).join(', ')}`)
  results.push(...(await specTierOrdered(rest, 'Features')))
}

// Summarize for the orchestrator's consolidation pass (Phase C).
const summary = results.filter(Boolean).map((r) => ({
  slug: r.f.slug,
  name: r.f.name,
  tier: r.f.tier ?? 'feature',
  size: r.size,
  requirements: r.requirements?.verdict,
  design: r.design?.verdict,
  tasks: r.tasks?.verdict,
  execution: r.execution
    ? { status: r.execution.status, typecheck: r.execution.typecheck, tests: r.execution.tests, conformance: r.execution.conformance }
    : undefined,
  unresolvedBlockers: [
    ...(r.requirements?.blockers ?? []),
    ...(r.design?.blockers ?? []),
    ...(r.tasks?.blockers ?? []),
    ...(r.execution?.blockers ?? []),
  ],
}))

const needsAttention = summary.filter(
  (s) =>
    s.unresolvedBlockers.length > 0 ||
    [s.requirements, s.design, s.tasks].includes('revise') ||
    [s.requirements, s.design, s.tasks].includes('reject') ||
    (s.execution && (s.execution.status !== 'complete' || s.execution.typecheck === 'fail' || s.execution.tests === 'fail' || s.execution.conformance === 'fail')),
)

log(`Spec fan-out complete: ${summary.length} feature(s) ${implement ? 'planned + implemented' : 'planned'}, ${needsAttention.length} need attention.`)

return { app, implement, planned: summary, needsAttention }
