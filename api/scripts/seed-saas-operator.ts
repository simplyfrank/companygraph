// saas-operator-foundation T-09 (design §4.4, §7 — FR-07, FR-08, FR-09,
// NFR-02, AC-06, AC-07, AC-08). The `bun run seed:saas-operator` CLI
// entrypoint — the directory-iterating seed loader.
//
// Step (a) ALWAYS ensures the scaffold (root → domains → systems → roles →
// personas), regardless of directory contents, so an empty slice directory is
// a clean no-op (not an error). Step (b) discovers every *.json in
// shared/seed/saas-operator/ (sorted, deterministic) and loads each through
// POST /api/v1/import (realImport, the guarded {nodes,edges} process-content
// route — B-02, NEVER /api/v1/ontology/import). Adding a slice file requires
// NO edit to this loader (AC-06). A non-2xx import (incl. the 409 lifecycle
// guard) is surfaced as a script failure (AC-08).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDriver, closeDriver } from "../src/neo4j/driver";
import { loadEnv } from "../src/env";
import { ensureOperatorRoot } from "../src/seed/ensure-operator-root";
import { ensureFunctionDomains } from "../src/seed/ensure-function-domains";
import { ensureSystems, ensureRoles, ensurePersonas } from "../src/seed/ensure-catalog";

export interface SeedResult {
  operatorRootId: string;
  domainIds: Record<string, string>;
  systemIds: Record<string, string>;
  roleIds: Record<string, string>;
  personaIds: Record<string, string>;
  slicesLoaded: string[];
}

export async function seedSaasOperator(base?: string): Promise<SeedResult> {
  const env = loadEnv();
  const apiBase = base ?? `http://${env.host}:${env.apiPort}`;
  const driver = getDriver();

  // Step (a) — ensure scaffold (always).
  const root = await ensureOperatorRoot(driver);
  const domainMap = await ensureFunctionDomains(driver, root.id);
  const systemMap = await ensureSystems(driver);
  const roleMap = await ensureRoles(driver);
  const personaMap = await ensurePersonas(apiBase);

  // Step (b) — discover + load slices via POST /api/v1/import (B-02).
  const dir = resolve(import.meta.dir, "../../shared/seed/saas-operator");
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json")) // skips .gitkeep → empty-dir no-op
        .sort()
    : [];

  const slicesLoaded: string[] = [];
  for (const f of files) {
    const body = readFileSync(resolve(dir, f), "utf8");
    const res = await fetch(`${apiBase}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const json = (await res.json()) as unknown;
    // 409 model_lifecycle_route_required → malformed fixture; surface + fail.
    if (!res.ok) {
      throw new Error(`seed:saas-operator: POST /api/v1/import (${f}) → ${res.status} ${JSON.stringify(json)}`);
    }
    // realImport returns 200 even with per-row errors[]; a slice with any row
    // failure is a malformed fixture → fail loudly.
    const result = json as { errors?: unknown[] };
    if (Array.isArray(result.errors) && result.errors.length > 0) {
      throw new Error(`seed:saas-operator: import of ${f} reported row errors: ${JSON.stringify(result.errors)}`);
    }
    slicesLoaded.push(f);
  }

  return {
    operatorRootId: root.id,
    domainIds: Object.fromEntries(domainMap),
    systemIds: Object.fromEntries(systemMap),
    roleIds: Object.fromEntries(roleMap),
    personaIds: Object.fromEntries(personaMap),
    slicesLoaded,
  };
}

if (import.meta.main) {
  seedSaasOperator()
    .then((r) => {
      console.log(`[seed:saas-operator] operator root: ${r.operatorRootId}`);
      console.log(`[seed:saas-operator] domains: ${Object.keys(r.domainIds).length}, systems: ${Object.keys(r.systemIds).length}, roles: ${Object.keys(r.roleIds).length}, personas: ${Object.keys(r.personaIds).length}`);
      console.log(`[seed:saas-operator] slices loaded: ${r.slicesLoaded.length ? r.slicesLoaded.join(", ") : "(none)"}`);
      return closeDriver();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[seed:saas-operator] failed:", e);
      await closeDriver().catch(() => {});
      process.exit(1);
    });
}
