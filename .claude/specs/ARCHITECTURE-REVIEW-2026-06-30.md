# companygraph — Architecture & Spec-Completeness Review

**Date:** 2026-06-30
**Reviewer:** Claude Code session (read-only audit; nothing modified, committed, or reverted)
**Scope:** Systems architecture and spec completeness vs. the stated intention
(`CLAUDE.md` + `.claude/specs/`).

---

## Verdict

The running application has diverged so far from its stated intention that the
governance documents now **actively misdescribe the system**. What was specced
as a single-tenant, no-auth, Neo4j-only graph platform has, in the working tree,
become a multi-tenant, OAuth-secured, multi-store enterprise governance suite
(KPI / OKR / SLA / risk / compliance) backed by three datastores.

**The single most important fact: 100% of the drift is UNCOMMITTED (untracked).**
The committed tree is still clean and spec-compliant; `main` is green only because
none of the expansion was ever committed.

---

## 1. Core invariant violated — NFR-08 / AC-22 (no auth)

`CLAUDE.md` / NFR-08 / AC-22 state there are *no auth code paths, no user/session/tenant
model*, enforced by `api/__tests__/no-auth-grep.test.ts`.

Reality:
- Full auth subsystem, **enforced at runtime** — `api/src/router.ts:289-327` rejects
  every non-public request (`401` no/unknown session, `403` missing permission), then
  attaches `req.user`.
- **Multi-tenant / multi-store** — `UserSession` carries `roles, storeAccess,
  personaAssignments, rbacRoles, permissions` (`api/src/auth/oauth.ts:30-37`);
  `hasStoreAccess`, `mapUserToStores`, `hasDomainAccess` gate by store and domain.
- OneLogin OAuth (`ONELOGIN_*` env, undocumented in `.env.example`). JWT **is**
  signature-verified via `jose`+JWKS when an issuer is configured
  (`oauth.ts:103-105`); verification is skipped only as a dev-mode fallback when no
  issuer is set (`oauth.ts:97-100`). Guard that before any non-dev deploy.
- **The guard test is RED** — `AC-22 no-auth-grep` fails with 22 violations. The test
  is tracked and unmodified since the original graph-core commit (`d331cb7`).

## 2. Scope drift — roughly half the app is ungoverned

No spec directory governs KPI/SLA/OKR/persona/RBAC/risk/compliance/glossary/Kafka.
A spec grep returns only incidental word mentions.

Schema drift confirms it: `shared/src/schema/nodes.ts` went from the canonical **6
labels to 18**; `edges.ts` from **6 to 12** types. The `EDGE_ENDPOINTS` matrix that
`CLAUDE.md` calls authoritative (9 positive pairs) no longer matches.

## 3. Data architecture — 1 store claimed, 3 live + 2 rotting

- **Neo4j** — graph (as designed). ✅
- **Postgres** — real, fully-wired second source of truth, undocumented. `pg` Pool
  (`api/src/storage/postgres/client.ts`), 5 SQL migrations; `change-requests /
  risk-register / kpi-measurements / sla-breaches` read/write it. Business data lives
  **outside the graph**, undercutting the "everything is a node/edge" thesis.
- **SQLite** (`bun:sqlite`) — chat persistence, in-spec. ✅
- **Redis** — half-wired stub: interface + call sites on the auth path, no client, no
  dep; falls back to in-memory. Latent rot.
- **Kafka** — `api/src/ingest/kafka-consumer.ts` is an orphan: never imported/started,
  TODO bodies, no `kafkajs` dep. Dead code.

## 4. Spec completeness & governance health

- graph-core / ontology-manager / process-explorer-ui / chat-interface: thorough specs,
  genuinely executed. The spec process worked for the original scope.
- **cto-analytics**: still `requirements:approved` (design/tasks/execution PENDING) yet
  analytics views shipped — built off-spec.
- **Governance loop has stopped.** Specs froze 2026-05-23; last commit also 2026-05-23
  (~5 weeks stale at review date); **264 uncommitted working-tree entries** (94 modified,
  164 untracked) including the entire auth subsystem and a 6.8M untracked
  `design/companygraph_v2/` duplicate fork (470 files, not gitignored).

## 5. Build / dep health (mostly environmental)

- API type-checks clean (`bun build --no-bundle` → exit 0).
- PWA build + shared test suite blocked by broken dependency symlinks (`vite`,
  `shared/node_modules/zod`) — run `bun install`.
- `bun test` hangs: the `test` script filters by name not file, so integration files
  still dial a stopped Neo4j.
- `better-sqlite3` is a declared-but-unused phantom dep (code uses `bun:sqlite`).

---

## Ungoverned surface inventory (all UNTRACKED)

| Group | Files | ~Lines | Datastore |
|---|---|---:|---|
| Auth / RBAC / tenancy | `auth/*` (5), `routes/{auth,rbac-roles,user-persona,persona}` | ~2,280 | Redis (stub) |
| KPI / SLA | `routes/{kpi-crud,kpi-measurements,kpi-trends,kpi-sla-alignment,sla-crud,sla-breaches,sla-compliance}` + `shared/schema/kpi-sla.ts` | ~1,870 | Postgres + Neo4j |
| OKR / roll-down | `routes/{okr-crud,roll-down}` | ~1,800 | Neo4j |
| Risk / compliance / change | `routes/{risk-register,risk-compliance,compliance-rules,change-requests}` | ~915 | Postgres |
| Typed domain/journey CRUD | `routes/{domain-crud,journey-crud,journey-versions}` | ~720 | Neo4j |
| Ontology extras | `routes/{ontology-glossary-*,ontology-bounded-contexts,ontology-proposals,ontology-rdf-*,snapshot}` | ~710 | Neo4j |
| Kafka ingest | `ingest/kafka-consumer.ts` | ~200 | — (orphan) |
| Postgres layer | `storage/postgres/{client,run-migrations}.ts` + 5 `.sql` | — | Postgres |
| Persona schema | `shared/schema/persona.ts` (+12 labels/+6 edges in nodes/edges.ts) | ~85 | — |
| PWA off-spec | `views/exec/*` (11), `views/analytics/*` (4) + components | large | — |

---

## Reconciliation — the decision

The drift is entirely uncommitted, so the choice is clean optionality, not untangling.

**Revert** (treat as a spike): stash the working tree to a branch first (don't lose
~8,500 lines), then remove untracked drift dirs/files and `git checkout --` the tracked
wiring edits (`router.ts`, `env.ts`, `docker-compose.yml`, `shared/schema/{nodes,edges}.ts`).

**Adopt** (expansion is the product direction):
1. Retire NFR-08 + the no-auth test; rewrite `CLAUDE.md` to the 3-store, multi-tenant,
   RBAC truth.
2. Document Postgres + OneLogin in `.env.example`; add postgres/redis to the architecture.
3. Bring surfaces under specs (`/spec-adopt`): an auth/RBAC/tenancy spec, a KPI/SLA/OKR
   governance spec, a risk/compliance spec. Run cto-analytics' design→tasks→execution.

**Regardless of direction:** preserve the 264 uncommitted files to a branch before more
is lost; get CI honest (it gates on a currently-red test once committed); remove the dead
Kafka orphan and phantom `better-sqlite3` dep; decide the fate of `design/companygraph_v2/`.
