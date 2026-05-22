// T-18c — POST /api/v1/ontology/migrations REST handler (design §5.1, FR-16).
//
// Thin route wrapper over T-16's `executeMigration` storage helper. The
// route validates the request body against `migrationCreateSchema` (the
// discriminated union over the 5 supported migration types — pass-1 C-09
// closes the Cypher-injection surface by routing every variant through a
// fixed parameterised template), then runs the migration.
//
// Success response shape (design §5.1):
//   { migration_id: uuidv7, rows_affected: number, version_id: uuidv7 }
//
// Per design §4.5 ordering rule, the post-commit
// `ontologyEvents.emit("ontology.changed", ...)` fires from this route
// layer AFTER `executeMigration` returns — never from inside the storage
// transaction.
//
// `?dryRun=true` is accepted on the route but is a NO-OP — migrations are
// too low-level for dryRun semantics. The operator-facing surface for
// dry-running attribute changes is `patchNodeLabel?forceBackfill=false`,
// which itself surfaces `would_invalidate` (FR-12).

import { migrationCreateSchema } from "@companygraph/shared/schema/ontology";
import { getDriver } from "../neo4j/driver";
import { executeMigration } from "../ontology/storage/migrations";
import { ontologyEvents } from "../ontology/events";
import { generateId } from "../ids";
import { ERROR_CODE_THROWERS } from "../ontology/error-throwers";
import { ok, readJson } from "./_helpers";

function actor(url: URL): string {
  return url.searchParams.get("actor") ?? "operator";
}

// POST /api/v1/ontology/migrations
export async function handlePostMigration(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const body = await readJson(req);
  const parsed = migrationCreateSchema.safeParse(body);
  if (!parsed.success) {
    ERROR_CODE_THROWERS.invalid_payload({
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const driver = getDriver();
  const result = await executeMigration(driver, parsed.data!, actor(url));

  // The migration affected the data graph and wrote audit/version/event
  // rows. Invalidate caches subscribed to `ontology.changed` so the next
  // /schema or attribute-validator read picks up any structural changes
  // (`merge_labels` / `split_label` reshape the label space).
  ontologyEvents.emit("ontology.changed", {
    event_id: generateId(),
    version_id: result.version_id,
    ts: new Date().toISOString(),
    diff: [
      {
        op: "test",
        path: `/migrations/${result.migration_id}`,
        value: {
          rows_affected: result.rows_affected,
          type: parsed.data!.type,
          target: parsed.data!.target,
        },
      },
    ],
  });
  return ok(result);
}
