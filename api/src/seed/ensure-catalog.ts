// saas-operator-foundation T-07 + T-08 (design §3.3, §4.3 — FR-04, FR-05,
// FR-12, NFR-01, NFR-02, AC-04, AC-05). The shared System/Role/Persona
// catalog seeders — idempotent, model-independent reference nodes seeded once.
//
// Idempotency marker — top-level `operatorSeedKey` (B-01/B-02/N-01). `seedKey`
// lives inside opaque attributes_json so it can't be a MERGE key. MERGE-on-
// bare-`name` is REJECTED: the retail seed has System {name:"CRM"} with no
// operatorSeedKey, and MERGE-on-name would match/mutate that retail node.
// Instead every catalog node MERGEs on the operator-owned top-level
// `operatorSeedKey`, which no retail node carries — so the operator CRM is
// always a distinct node and the retail CRM is never read/matched/written.
//
// Rule A — Systems/Roles use the ESTABLISHED seed-script direct-driver MERGE
// pattern (seed-rbac-roles.ts shape, a trusted operator-tooling write that
// bypasses the router gate by design). Personas ride POST /api/v1/personas.
// No :RBACRole is seeded; no permission string is added (FR-12).

import type { Driver } from "neo4j-driver";
import { generateId } from "../ids";
import { SYSTEMS, ROLES, PERSONAS } from "./saas-operator-catalog";
import { loadEnv } from "../env";

function apiBase(): string {
  const env = loadEnv();
  return `http://${env.host}:${env.apiPort}`;
}

// ---------------------------------------------------------------------------
// Systems (ensureSystems) — MERGE (:System {operatorSeedKey}).
// C-07: Systems CONVERGE attributes on re-seed (ON MATCH SET attributes_json).
// attributes_json carries {systemKind, seedKey}; systemKind is set explicitly
// so the System registry attribute check passes.
// ---------------------------------------------------------------------------
export async function ensureSystems(driver: Driver): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    for (const sys of SYSTEMS) {
      const now = new Date().toISOString();
      const attrs = JSON.stringify({ systemKind: sys.systemKind, seedKey: sys.seedKey });
      const result = await session.run(
        `MERGE (s:System {operatorSeedKey: $seedKey})
         ON CREATE SET s.id = $id, s.name = $name, s.description = $desc,
                       s.createdAt = $now, s.updatedAt = $now, s.attributes_json = $attrs
         ON MATCH  SET s.name = $name, s.description = $desc, s.updatedAt = $now,
                       s.attributes_json = $attrs
         RETURN s.id AS id`,
        { seedKey: sys.seedKey, id: generateId(), name: sys.name, desc: sys.description, now, attrs },
      );
      map.set(sys.seedKey, result.records[0]!.get("id") as string);
    }
  } finally {
    await session.close();
  }
  return map;
}

// ---------------------------------------------------------------------------
// Roles (ensureRoles) — MERGE (:Role {operatorSeedKey}). :Role, NOT :RBACRole.
// C-07: Roles KEEP first-written attributes on re-seed (ON MATCH omits
// attributes_json). attributes_json carries {seedKey}.
// ---------------------------------------------------------------------------
export async function ensureRoles(driver: Driver): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    for (const role of ROLES) {
      const now = new Date().toISOString();
      const attrs = JSON.stringify({ seedKey: role.seedKey });
      const result = await session.run(
        `MERGE (r:Role {operatorSeedKey: $seedKey})
         ON CREATE SET r.id = $id, r.name = $name, r.description = $desc,
                       r.createdAt = $now, r.updatedAt = $now, r.attributes_json = $attrs
         ON MATCH  SET r.name = $name, r.description = $desc, r.updatedAt = $now
         RETURN r.id AS id`,
        { seedKey: role.seedKey, id: generateId(), name: role.name, desc: role.description, now, attrs },
      );
      map.set(role.seedKey, result.records[0]!.get("id") as string);
    }
  } finally {
    await session.close();
  }
  return map;
}

// ---------------------------------------------------------------------------
// Personas (ensurePersonas) — via POST /api/v1/personas (persona:write).
//
// AS-BUILT DEVIATION from design C-06: C-06 pinned the operator marker to a
// NESTED attributes.operatorSeedKey, on the premise that the persona route
// writes a native nested `attributes` map. Verified as-built, that premise is
// false: the route does `CREATE (p:Persona {attributes:$attributes})`, and
// Neo4j REJECTS a Map property value ("Property values can only be of
// primitive types or arrays thereof") — a nested attributes map cannot be
// persisted through this route at all. Editing persona.ts to serialize the map
// is forbidden (owned-elsewhere, NFR-04). The achievable path that honors the
// no-edit boundary: pass `attributes` as a JSON STRING (a primitive Neo4j
// accepts) carrying {operatorSeedKey, seedKey}. The marker stays resolvable
// (parse the string), and idempotency is a pre-create lookup on the operator
// persona `name` (operator names are unique and disambiguated from
// model-workspace-core-seeded personas). No permission string is added (FR-12).
// ---------------------------------------------------------------------------
interface PersonaRecord {
  id: string;
  name: string;
  attributes?: unknown;
}

function parsePersonaAttributes(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

export async function ensurePersonas(base: string = apiBase()): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // Snapshot existing personas once; index the operator ones by name.
  const listRes = await fetch(`${base}/api/v1/personas`);
  if (!listRes.ok) {
    throw new Error(`ensurePersonas: GET /api/v1/personas → ${listRes.status}`);
  }
  const listBody = (await listRes.json()) as { personas?: PersonaRecord[] };
  const existing = listBody.personas ?? [];
  const byName = new Map<string, PersonaRecord>();
  for (const p of existing) byName.set(p.name, p);

  for (const persona of PERSONAS) {
    const found = byName.get(persona.name);
    if (found) {
      const attrs = parsePersonaAttributes(found.attributes);
      if (attrs.operatorSeedKey === persona.seedKey) {
        map.set(persona.seedKey, found.id); // idempotent path — reuse operator persona
        continue;
      }
      // A non-operator persona of the same name would be a naming collision;
      // do not touch it — surface so the content spec can disambiguate.
      throw new Error(
        `ensurePersonas: persona name "${persona.name}" exists without the operator marker`,
      );
    }
    const res = await fetch(`${base}/api/v1/personas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: persona.name,
        description: persona.description,
        // attributes as a JSON string (see the as-built deviation note above).
        attributes: JSON.stringify({ operatorSeedKey: persona.seedKey, seedKey: persona.seedKey }),
      }),
    });
    if (!res.ok) {
      throw new Error(`ensurePersonas: POST /api/v1/personas (${persona.seedKey}) → ${res.status}`);
    }
    const body = (await res.json()) as { persona?: PersonaRecord };
    const id = body.persona?.id;
    if (!id) throw new Error(`ensurePersonas: no id for persona ${persona.seedKey}`);
    map.set(persona.seedKey, id);
  }

  return map;
}
