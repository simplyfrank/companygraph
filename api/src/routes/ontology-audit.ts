// T-06 — GET /api/v1/ontology/audit and GET /api/v1/ontology/versions
// handlers (design §4.6).
//
// Both are read-only, paginated by `?limit=<n>&before=<ts>` (cursor is
// an ISO timestamp for the `_OntologyAudit.ts` / `_OntologyVersion.ts`
// index created by applyMetaSchema — the `_onto_audit_ts` and
// `_onto_event_ts` indexes). Default limit: 50, max: 200.
//
// `GET /api/v1/ontology/audit`
//   Returns { rows: AuditResponseRow[], nextCursor: string | null }
//   Rows ordered `ts DESC`. Optional `?target=<name>` filters to a
//   single entity.
//
// `GET /api/v1/ontology/versions`
//   Returns { rows: VersionRow[], nextCursor: string | null }
//   Rows ordered `ts DESC`.

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { deserializeAudit } from "../ontology/storage/audit";
import { ok } from "./_helpers";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function pageParams(url: URL): { limit: number; before: string | null } {
  const raw = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(raw) && raw > 0
    ? Math.min(raw, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const before = url.searchParams.get("before") ?? null;
  return { limit, before };
}

// GET /api/v1/ontology/audit
export async function handleListAudit(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { limit, before } = pageParams(url);
  const target = url.searchParams.get("target") ?? null;

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const cypher = target
      ? `MATCH (a:_OntologyAudit {target: $target})
         WHERE ($before IS NULL OR a.ts < $before)
         RETURN a.ts AS ts, a.actor AS actor, a.action AS action,
                a.target AS target, a.before_json AS before_json,
                a.after_json AS after_json, a.diff_jsonpatch AS diff_jsonpatch,
                a.version_id AS version_id
         ORDER BY a.ts DESC LIMIT $limit`
      : `MATCH (a:_OntologyAudit)
         WHERE ($before IS NULL OR a.ts < $before)
         RETURN a.ts AS ts, a.actor AS actor, a.action AS action,
                a.target AS target, a.before_json AS before_json,
                a.after_json AS after_json, a.diff_jsonpatch AS diff_jsonpatch,
                a.version_id AS version_id
         ORDER BY a.ts DESC LIMIT $limit`;
    const result = await session.run(cypher, {
      target,
      before,
      limit,
    });
    const rows = result.records.map(deserializeAudit);
    const nextCursor = rows.length === limit ? (rows[rows.length - 1]?.ts ?? null) : null;
    return ok({ rows, nextCursor });
  } finally {
    await session.close();
  }
}

// GET /api/v1/ontology/versions
export async function handleListVersions(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { limit, before } = pageParams(url);

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (v:_OntologyVersion)
       WHERE ($before IS NULL OR v.ts < $before)
       RETURN v.version_id AS version_id, v.parent_version_id AS parent_version_id,
              v.actor AS actor, v.summary AS summary, v.ts AS ts,
              v.diff_jsonpatch AS diff_jsonpatch
       ORDER BY v.ts DESC LIMIT $limit`,
      { before, limit },
    );
    const rows = result.records.map((rec) => ({
      version_id: rec.get("version_id") as string,
      parent_version_id: (rec.get("parent_version_id") as string | null) ?? null,
      actor: rec.get("actor") as string,
      summary: rec.get("summary") as string,
      ts: rec.get("ts") as string,
      diff_jsonpatch: (() => {
        const raw = rec.get("diff_jsonpatch");
        return typeof raw === "string" ? JSON.parse(raw) : null;
      })(),
    }));
    const nextCursor = rows.length === limit ? (rows[rows.length - 1]?.ts ?? null) : null;
    return ok({ rows, nextCursor });
  } finally {
    await session.close();
  }
}
