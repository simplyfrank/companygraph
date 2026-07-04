export const meta = {
  name: 'app-onboard',
  description:
    'Reverse-engineer an existing application (data model, API layer, event structure, business logic, actors, integrations) into a companygraph business-process model: parallel extraction → synthesis → validation, producing a dossier + import payload for the /app-onboard review gate',
  phases: [
    { title: 'Extract' },
    { title: 'Synthesize' },
    { title: 'Validate' },
  ],
}

// ---------------------------------------------------------------------------
// Input: args = { app: "<app-slug>", path: "<abs path to target repo>",
//                 outDir: "<abs path to .claude/onboarding/<app-slug>>" }
// The /app-onboard orchestrator resolves + clones the target and creates
// outDir BEFORE launching this workflow (workflow scripts have no FS access).
// Per the spec-app precedent: if args don't propagate on a named launch,
// inline the three consts into the script body and relaunch via `script`.
//
// Extraction agents are the read-only `app-archaeologist` agent type
// (.claude/agents/app-archaeologist.md). Synthesis + validation use
// general-purpose agents (they write the dossier + import payload into
// outDir). The import into the live graph is NOT done here — the human
// review gate in the /app-onboard skill sits between this workflow's output
// and any write to companygraph.
// ---------------------------------------------------------------------------

let parsedArgs = args
if (typeof parsedArgs === 'string') {
  try { parsedArgs = JSON.parse(parsedArgs) } catch (_e) { parsedArgs = {} }
}
const app = parsedArgs?.app
const path = parsedArgs?.path
const outDir = parsedArgs?.outDir
if (!app || !path || !outDir) {
  throw new Error(
    'app-onboard workflow: args {app, path, outDir} are all required (run the /app-onboard Phase 0 scope pass first). ' +
      'If launched by name and args did not propagate, inline the three consts into the script body and relaunch via `script`.',
  )
}

// One findings shape for every surface — the per-surface semantics live in
// the prompt + the app-archaeologist agent doctrine.
const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    surface: { type: 'string' },
    absent_because: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: {
            type: 'string',
            enum: [
              'entity', 'state-enum', 'aggregate-cluster',
              'operation', 'operation-sequence',
              'event', 'producer-consumer', 'scheduled-job',
              'flow', 'branch', 'compensation', 'invariant',
              'actor', 'permission', 'approval-chain',
              'external-system', 'integration', 'deployment-site',
              'kpi-candidate',
            ],
          },
          app_name: { type: 'string', description: "the app's own identifier (table/route/topic/class)" },
          business_name: { type: 'string', description: 'proposed business-language name' },
          description: { type: 'string' },
          relates_to: { type: 'array', items: { type: 'string' }, description: 'app_names of related findings' },
          evidence: { type: 'array', items: { type: 'string' }, description: 'file:line citations' },
          confidence: { type: 'string', enum: ['confirmed', 'inferred', 'assumed'] },
        },
        required: ['kind', 'app_name', 'business_name', 'description', 'evidence', 'confidence'],
      },
    },
  },
  required: ['surface', 'findings'],
}

const SYNTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dossier_path: { type: 'string' },
    import_path: { type: 'string' },
    counts: {
      type: 'object',
      additionalProperties: false,
      properties: {
        domains: { type: 'number' }, journeys: { type: 'number' },
        activities: { type: 'number' }, roles: { type: 'number' },
        systems: { type: 'number' }, locations: { type: 'number' },
        edges: { type: 'number' },
      },
      required: ['domains', 'journeys', 'activities', 'roles', 'systems', 'edges'],
    },
    open_questions: { type: 'array', items: { type: 'string' } },
    assumed_count: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['dossier_path', 'import_path', 'counts', 'open_questions', 'summary'],
}

const VALIDATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    checks: { type: 'array', items: { type: 'string' } },
    failures: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'checks', 'summary'],
}

const SURFACES = [
  { key: 'data-model', focus: 'migrations, ORM entities, schema/DDL files: entities, key fields, status/state enums (ordered-flow evidence), aggregate clusters (candidate Domains)' },
  { key: 'api-surface', focus: 'route tables, controllers, OpenAPI/GraphQL: write operations as candidate Activities, read ops as supporting, resource + call-sequence grouping into candidate journeys' },
  { key: 'events', focus: 'queues, topics, webhooks, domain events, outbox tables, cron/schedulers: producer→consumer pairs (PRECEDES evidence), cross-service traffic (INTEGRATES_WITH), rates/SLAs (KPI candidates)' },
  { key: 'business-logic', focus: 'services, use-case classes, state machines, sagas, validation rules: step ordering, branching, compensation, done-invariants' },
  { key: 'actors-permissions', focus: 'auth roles, scopes, permission checks, user-type enums, approval chains: candidate Roles + EXECUTES bindings' },
  { key: 'integrations-deployment', focus: 'external SDK/API clients, third-party SaaS, infra manifests, regions/sites: candidate System nodes + INTEGRATES_WITH, Location evidence' },
]

phase('Extract')
log(`Extracting 6 surfaces of ${app} at ${path}`)

// Barrier justified: the synthesis agent needs ALL surfaces' findings at
// once to cross-correlate (an API op + a state enum + an event chain often
// describe the same activity).
const extractions = await parallel(
  SURFACES.map((s) => () =>
    agent(
      `Target application: "${app}" at ${path} (read-only — never modify it).\n` +
        `Analyze the "${s.key}" surface: ${s.focus}.\n` +
        `Follow your agent doctrine (evidence + confidence per finding, app vocabulary AND proposed ` +
        `business name, skip vendored/build dirs, empty-with-absent_because when the surface is missing). ` +
        `Set surface="${s.key}" in your structured output.`,
      { label: `extract:${s.key}`, phase: 'Extract', agentType: 'app-archaeologist', schema: FINDINGS_SCHEMA },
    )),
)

const surfaces = extractions.filter(Boolean)
const totalFindings = surfaces.reduce((n, s) => n + (s.findings?.length ?? 0), 0)
log(`Extraction complete: ${surfaces.length}/6 surfaces, ${totalFindings} findings`)
if (!totalFindings) {
  throw new Error(`app-onboard: extraction produced zero findings for ${app} — wrong path or empty target; aborting before synthesis`)
}

phase('Synthesize')

const synthesis = await agent(
  `You are the synthesis step of companygraph's /app-onboard pipeline for application "${app}".\n\n` +
    `INPUT — the six extraction result sets (JSON):\n${JSON.stringify(surfaces)}\n\n` +
    `Read .claude/skills/app-onboard/SKILL.md (mapping doctrine) and ` +
    `.claude/skills/app-onboard/templates/dossier.md (output format), plus shared/src/schema/nodes.ts ` +
    `and shared/src/schema/edges.ts (the vocabulary + EDGE_ENDPOINTS whitelist you must conform to) and ` +
    `shared/seed/retail-mini.json (the exact import payload format: nodes[{label,id,name,description,attributes?}], ` +
    `edges[{type,id,fromId,toId}]).\n\n` +
    `Produce TWO files:\n` +
    `1. ${outDir}/dossier.md — the reverse-engineering dossier per the template: per-surface findings digest, ` +
    `the mapping tables (finding → companygraph node/edge, with evidence + confidence), the proposed process ` +
    `model (domains → journeys → ordered activities, roles, systems incl. systemKind classification ` +
    `functional|agentic|ai_predictive per XD-15, locations, KPI candidates), and EVERY open question / ` +
    `assumed-confidence mapping listed for the human review gate.\n` +
    `2. ${outDir}/import.json — the import payload. Rules: deterministic UUIDv7-SHAPED ids derived from ` +
    `"${app}:<label>:<name>" (hash into the low 62 bits, fixed timestamp prefix, version nibble 7, variant ` +
    `nibble 8 — same handcrafted pattern as retail-mini.json) so re-onboarding upserts idempotently; every ` +
    `edge (type, fromLabel, toLabel) combination MUST be legal per EDGE_ENDPOINTS; the application itself is ` +
    `a System node with a systemKind attribute; provenance goes in each node's attributes ` +
    `(source: "${app}", evidence: [file:line...], confidence).\n\n` +
    `Do NOT import anything into the live graph — the human review gate does that. Return the structured summary.`,
  { label: `synthesize:${app}`, phase: 'Synthesize', agentType: 'general-purpose', schema: SYNTH_SCHEMA },
)

if (!synthesis) throw new Error('app-onboard: synthesis agent died — nothing to validate')
log(`Synthesis: ${JSON.stringify(synthesis.counts)} · ${synthesis.open_questions.length} open question(s)`)

phase('Validate')

const validation = await agent(
  `You are the validation step of companygraph's /app-onboard pipeline for "${app}". Adversarially verify ` +
    `the synthesis output — try to REJECT it.\n\n` +
    `Validate ${synthesis.import_path} against the live schema registries:\n` +
    `1. Parse the JSON; every node has label/id/name/description; every edge has type/id/fromId/toId.\n` +
    `2. Every node label + edge type exists in shared/src/schema/{nodes,edges}.ts (or is a documented ` +
    `runtime-registry label — check the dossier if it claims one).\n` +
    `3. Every edge's (type, from-label, to-label) combination is legal per EDGE_ENDPOINTS.\n` +
    `4. No dangling fromId/toId; no duplicate ids; ids are UUIDv7-shaped (version nibble 7, variant 8/9/a/b) ` +
    `and deterministic (re-derivable from "${app}:<label>:<name>").\n` +
    `5. Every System node carries systemKind ∈ {functional, agentic, ai_predictive}.\n` +
    `6. PRECEDES chains are acyclic per journey; every Activity is PART_OF exactly one UserJourney; every ` +
    `UserJourney is PART_OF exactly one Domain.\n` +
    `7. Cross-check ${synthesis.dossier_path}: every "assumed" mapping in import.json appears in the ` +
    `dossier's open-questions section (nothing assumed slips through silently).\n` +
    `Write a small throwaway check script under ${outDir}/checks/ if useful (bun). Report every check run ` +
    `and every failure precisely. verdict="fail" if ANY check fails.`,
  { label: `validate:${app}`, phase: 'Validate', agentType: 'general-purpose', schema: VALIDATION_SCHEMA },
)

const verdict = validation?.verdict ?? 'fail'
log(`Validation: ${verdict}${validation?.failures?.length ? ` — ${validation.failures.length} failure(s)` : ''}`)

return {
  app,
  path,
  outDir,
  surfaces: surfaces.map((s) => ({ surface: s.surface, findings: s.findings.length, absent: s.absent_because ?? null })),
  totalFindings,
  synthesis,
  validation: validation ?? { verdict: 'fail', checks: [], failures: ['validation agent died'], summary: 'validation agent died' },
  readyForReviewGate: verdict === 'pass',
}
