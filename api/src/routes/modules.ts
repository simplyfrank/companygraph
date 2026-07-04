// model-workspace-core T-12 (design §5 modules* rows) — /api/v1/modules*
// handlers (FR-06). zod-validated at the boundary; standard envelope;
// auth in the central router gate only.

import {
  moduleCreateSchema,
  versionPublishSchema,
} from "@companygraph/shared/schema/model-workspace";
import { getDriver } from "../neo4j/driver";
import { parseOrThrow } from "../validate";
import {
  createModule,
  listModules,
  publishVersion,
  listVersions,
} from "../storage/modules";
import { error, ok, readJson } from "./_helpers";

function errorInvalidJson(): Response {
  return error(400, "invalid_payload", "request body is not valid JSON");
}

export async function handleModulePost(req: Request): Promise<Response> {
  const body = await readJson(req);
  const input = parseOrThrow(moduleCreateSchema, body);
  return ok(await createModule(getDriver(), input), 201);
}

export async function handleModuleList(_req: Request): Promise<Response> {
  return ok(await listModules(getDriver()));
}

// POST /api/v1/modules/:id/versions — publish an immutable version.
// Optional `{version?}` explicit-version mode (D-3); collision → 409
// module_version_immutable (the single reachable site, D-4). Default:
// auto-increment max+1 (FR-06).
export async function handleVersionPublish(req: Request, moduleId: string): Promise<Response> {
  // Empty body is legal here (default auto-increment mode) — only parse
  // JSON when the client actually sent some.
  const raw = await req.text();
  let body: unknown = {};
  if (raw.trim().length > 0) {
    try {
      body = JSON.parse(raw);
    } catch {
      return errorInvalidJson();
    }
  }
  const input = parseOrThrow(versionPublishSchema, body ?? {});
  const version = await publishVersion(getDriver(), moduleId, input);
  return ok(version, 201);
}

// GET /api/v1/modules/:id/versions — version DESC.
export async function handleVersionList(_req: Request, moduleId: string): Promise<Response> {
  return ok(await listVersions(getDriver(), moduleId));
}

// Router delegate — mirrors registerModelRoutes' shape. Null → no match.
export async function registerModuleRoutes(
  method: string,
  sub: string,
  req: Request,
): Promise<Response | null> {
  if (sub === "modules") {
    if (method === "POST") return handleModulePost(req);
    if (method === "GET") return handleModuleList(req);
  }
  const versions = sub.match(/^modules\/([^/]+)\/versions$/);
  if (versions) {
    if (method === "POST") return handleVersionPublish(req, versions[1]!);
    if (method === "GET") return handleVersionList(req, versions[1]!);
  }
  return null;
}
