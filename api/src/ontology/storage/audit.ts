// T-05 — In-transaction audit + version helpers (design §4.4).
//
// Both helpers MUST run inside the calling `executeWrite` transaction so
// that the audit row, version row, and event row commit atomically with
// the underlying mutation (NFR-01).
//
// `before` / `after` are serialised to JSON strings (`before_json` /
// `after_json`) and the diff is precomputed via `fast-json-patch.compare`
// to avoid re-parsing at audit-read time. The REST handler in §4.6
// (`deserializeAudit`) inverts the serialisation — see T-06.
//
// `writeVersion` chains parent → child linearly: each new version's
// `parent_version_id` is whichever `_OntologyVersion` has the largest
// `version_id` (UUIDv7 monotonicity). In single-tenant Neo4j (NFR-08)
// this is race-free in practice.

import type { ManagedTransaction } from "neo4j-driver";
import { compare as jsonpatchCompare, type Operation } from "fast-json-patch";

export interface AuditResponseRow {
  ts: string;
  actor: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  diff_jsonpatch: ReadonlyArray<Record<string, unknown>> | null;
  version_id: string;
}

// T-06 — inverts the JSON-string storage shape back to objects for the
// `GET /api/v1/ontology/audit` REST response (design §4.6). Mirrors
// graph-core's `attributes_json` storage-vs-REST contract.
//
// Accepts any `{ get(key): unknown }` shape — works with both Neo4j's
// `Record` and hand-rolled mocks in unit tests (NFR-09 / pass-1 N-07).
export function deserializeAudit(record: {
  get: (k: string) => unknown;
}): AuditResponseRow {
  const beforeRaw = record.get("before_json");
  const afterRaw = record.get("after_json");
  const diffRaw = record.get("diff_jsonpatch");
  return {
    ts: record.get("ts") as string,
    actor: record.get("actor") as string,
    action: record.get("action") as string,
    target: record.get("target") as string,
    before: typeof beforeRaw === "string" ? JSON.parse(beforeRaw) : null,
    after: typeof afterRaw === "string" ? JSON.parse(afterRaw) : null,
    diff_jsonpatch:
      typeof diffRaw === "string"
        ? (JSON.parse(diffRaw) as ReadonlyArray<Record<string, unknown>>)
        : null,
    version_id: record.get("version_id") as string,
  };
}

export async function writeAudit(
  tx: ManagedTransaction,
  actor: string,
  action: string,
  target: string,
  before: unknown,
  after: unknown,
  version_id: string,
): Promise<void> {
  const diff: Operation[] | null =
    before != null && after != null
      ? jsonpatchCompare(before as object, after as object)
      : null;
  await tx.run(
    `CREATE (a:_OntologyAudit {
       ts: $ts, actor: $actor, action: $action, target: $target,
       before_json: $before_json, after_json: $after_json,
       diff_jsonpatch: $diff_json, version_id: $version_id
     })`,
    {
      ts: new Date().toISOString(),
      actor,
      action,
      target,
      before_json: before != null ? JSON.stringify(before) : null,
      after_json: after != null ? JSON.stringify(after) : null,
      diff_json: diff != null ? JSON.stringify(diff) : null,
      version_id,
    },
  );
}

export async function writeVersion(
  tx: ManagedTransaction,
  version_id: string,
  actor: string,
  summary: string,
  diff_source: unknown,
): Promise<void> {
  const parent = await tx.run(
    `MATCH (v:_OntologyVersion)
     WITH v ORDER BY v.version_id DESC LIMIT 1
     RETURN v.version_id AS pid`,
  );
  const parent_id: string | null =
    (parent.records[0]?.get("pid") as string | null | undefined) ?? null;
  await tx.run(
    `CREATE (v:_OntologyVersion {
       version_id: $version_id, parent_version_id: $parent_id,
       diff_jsonpatch: $diff_json, actor: $actor, ts: $ts, summary: $summary
     })`,
    {
      version_id,
      parent_id,
      diff_json: JSON.stringify(diff_source),
      actor,
      ts: new Date().toISOString(),
      summary,
    },
  );
}
