// model-workspace-core T-16 (design §4.7 rev 4) — Retail → Business
// Model #1 migration. `bun run migrate:model` [--down [--force] | --dry-run].
//
// ORDERING RULE: the FIRST `migrate:model` run must precede the first
// `POST /api/v1/models`. The step-1 guard fails loudly if violated
// (reference model absent AND a non-reference model present — the one
// state where scoping could land on the wrong root). Once the
// reference model exists, user models are normal and re-runs proceed
// idempotently forever (NFR-02) — including after users create model
// #2+. Re-apply after a FORCED `--down` while user models exist trips
// the same guard and is UNSUPPORTED (design-review C-10 — documented,
// not special-cased; the `--force` refusal below exists precisely so
// that state is entered knowingly).
//
// The reference model is MERGE-keyed on `isReference:true` — NOT on
// `ordinal:1` — because createModel allocates ordinals from max+1
// starting at 1, so a user model could already hold ordinal 1 and a
// `MERGE {ordinal:1}` would silently match it (design §4.7, C-02).
//
// Prerequisite: `bun run schema:apply` (the ordinal uniqueness
// constraint, T-03). This script also ensures it IF NOT EXISTS so a
// fresh graph works standalone.
//
// - apply (default): guard → MERGE reference model → scope every
//   still-unscoped Domain via MERGE (d)-[:IN_MODEL]->(m). Idempotent —
//   a second run adds zero nodes/edges.
// - --down: REFUSAL GUARD FIRST (requirements rev-4 C-10 / design
//   §4.7 rev 4): while any non-reference BusinessModel exists, --down
//   refuses and writes NOTHING unless --force is also passed — the
//   operator must explicitly acknowledge that user models will remain
//   while the reference scoping is removed. When it proceeds (no user
//   models, or --force): delete IN_MODEL edges to the reference model
//   + DETACH DELETE the reference root (matched on isReference:true —
//   never an unqualified IN_MODEL sweep, so a later-created model's
//   IN_MODEL edges and subgraph survive intact). Domains/journeys/
//   activities untouched → counts identical to pre-migration.
// - --dry-run: read-only MATCHes; prints the deltas it WOULD write;
//   commits nothing (`/api/v1/stats` unchanged).

import type { Driver } from "neo4j-driver";
import { generateId } from "../ids";

export interface MigrationResult {
  mode: "apply" | "down" | "dry-run";
  createdModel: boolean;
  scopedDomains: number;
  removedEdges?: number;
  removedModels?: number;
}

async function ensureOrdinalConstraint(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
      `CREATE CONSTRAINT business_model_ordinal_unique IF NOT EXISTS
       FOR (m:BusinessModel) REQUIRE m.ordinal IS UNIQUE`,
    );
  } finally {
    await session.close();
  }
}

export async function migrateRetailToModel(
  driver: Driver,
  mode: "apply" | "down" | "dry-run" = "apply",
  opts: { force?: boolean } = {},
): Promise<MigrationResult> {
  const session = driver.session();
  try {
    if (mode === "down") {
      // Refusal guard (requirements rev-4 C-10; design §4.7 rev 4):
      // while any non-reference BusinessModel exists, --down refuses
      // and writes nothing unless --force is also passed.
      if (!opts.force) {
        const check = await session.executeRead((tx) =>
          tx.run(
            `RETURN EXISTS { MATCH (x:BusinessModel) WHERE coalesce(x.isReference, false) = false } AS hasUserModel`,
          ),
        );
        if (check.records[0]!.get("hasUserModel") as boolean) {
          throw new Error(
            "migrate:model --down REFUSED — one or more user (non-reference) BusinessModel roots exist. " +
              "Removing the reference scoping while user models remain leaves the graph in a state where " +
              "re-applying the migration is unsupported. Pass --force to proceed anyway (user models and " +
              "their IN_MODEL edges + subgraphs are left intact). Nothing was written.",
          );
        }
      }
      const result = await session.executeWrite(async (tx) => {
        const edges = await tx.run(
          `MATCH (:Domain)-[r:IN_MODEL]->(m:BusinessModel {isReference: true})
           DELETE r RETURN count(r) AS n`,
        );
        const models = await tx.run(
          `MATCH (m:BusinessModel {isReference: true}) DETACH DELETE m RETURN count(m) AS n`,
        );
        return {
          removedEdges: edges.records[0]?.get("n") as number,
          removedModels: models.records[0]?.get("n") as number,
        };
      });
      return { mode, createdModel: false, scopedDomains: 0, ...result };
    }

    // Shared read state for apply + dry-run.
    const state = await session.executeRead(async (tx) => {
      const guard = await tx.run(
        `RETURN
           EXISTS { MATCH (:BusinessModel {isReference: true}) } AS hasReference,
           EXISTS { MATCH (x:BusinessModel) WHERE coalesce(x.isReference, false) = false } AS hasUserModel`,
      );
      const rec = guard.records[0]!;
      const unscoped = await tx.run(
        `MATCH (d:Domain)
         WHERE NOT (d)-[:IN_MODEL]->(:BusinessModel)
         RETURN count(d) AS n`,
      );
      return {
        hasReference: rec.get("hasReference") as boolean,
        hasUserModel: rec.get("hasUserModel") as boolean,
        unscopedDomains: unscoped.records[0]!.get("n") as number,
      };
    });

    // Step-1 collision guard (design §4.7 rev 3, resolves review B-03):
    // abort ONLY when the reference model is absent AND a non-reference
    // model exists. With the reference model present, user models are
    // normal and re-runs proceed idempotently forever.
    if (!state.hasReference && state.hasUserModel) {
      throw new Error(
        "migrate:model GUARD ABORT — a user (non-reference) BusinessModel exists but the reference model does not. " +
          "The first migrate:model run must precede the first POST /api/v1/models " +
          "(re-apply after --down while user models exist is unsupported). Nothing was written.",
      );
    }

    if (mode === "dry-run") {
      return {
        mode,
        createdModel: !state.hasReference,
        scopedDomains: state.unscopedDomains,
      };
    }

    await ensureOrdinalConstraint(driver);
    const applied = await session.executeWrite(async (tx) => {
      const now = new Date().toISOString();
      const model = await tx.run(
        `MERGE (m:BusinessModel {isReference: true})
         ON CREATE SET m.id = $id, m.name = "Retail Reference", m.description = "Business Model #1 — the migrated retail reference graph (FR-10 / XD-12).",
                       m.status = "active", m.ordinal = 1,
                       m.createdAt = $now, m.updatedAt = $now, m.attributes_json = "{}"
         RETURN (m.createdAt = $now) AS wasCreated`,
        { id: generateId(), now },
      );
      const scoped = await tx.run(
        `MATCH (m:BusinessModel {isReference: true})
         MATCH (d:Domain)
         WHERE NOT (d)-[:IN_MODEL]->(:BusinessModel)
         MERGE (d)-[r:IN_MODEL]->(m)
         ON CREATE SET r.id = randomUUID(), r.createdAt = $now, r.attributes_json = "{}"
         RETURN count(r) AS n`,
        { now },
      );
      return {
        createdModel: (model.records[0]?.get("wasCreated") as boolean) ?? false,
        scopedDomains: (scoped.records[0]?.get("n") as number) ?? 0,
      };
    });
    return { mode, ...applied };
  } finally {
    await session.close();
  }
}

if (import.meta.main) {
  const { getDriver, closeDriver } = await import("../neo4j/driver");
  const mode = process.argv.includes("--down")
    ? "down"
    : process.argv.includes("--dry-run")
      ? "dry-run"
      : "apply";
  try {
    const result = await migrateRetailToModel(getDriver(), mode, {
      force: process.argv.includes("--force"),
    });
    if (result.mode === "dry-run") {
      console.log(
        `migrate:model DRY RUN — would ${result.createdModel ? "create" : "keep"} the reference model and scope ${result.scopedDomains} domain(s). Nothing written.`,
      );
    } else if (result.mode === "down") {
      console.log(
        `migrate:model DOWN — removed ${result.removedEdges} IN_MODEL edge(s) + ${result.removedModels} reference model root(s). Domains/journeys/activities untouched.`,
      );
    } else {
      console.log(
        `migrate:model APPLY — reference model ${result.createdModel ? "created" : "already present"}; scoped ${result.scopedDomains} previously-unscoped domain(s).`,
      );
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await closeDriver();
  }
}
