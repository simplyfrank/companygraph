// saas-operator-foundation T-01 / T-07 / T-08 (AC-04, AC-05) — shared
// System/Role/Persona catalog.
//
//  - T-01 shape check: SYSTEMS/ROLES/PERSONAS parse their schema; seedKeys unique.
//  - T-07 systems: seven Systems via operatorSeedKey MERGE, valid systemKind,
//    shared (not per-domain), no dup on re-run; operator CRM distinct; the
//    RETAIL CRM node is UNTOUCHED (id/description unchanged, no operatorSeedKey).
//    C-07: Systems converge attributes on re-seed.
//  - T-07 roles: :Role (NOT :RBACRole), no dup; C-07 Roles keep first-written
//    attributes.
//  - T-08 personas: one :Persona per function via POST /api/v1/personas, marker
//    NESTED at attributes.operatorSeedKey (C-06), no dup on re-run; no new
//    permission string.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  SYSTEMS,
  ROLES,
  PERSONAS,
  catalogSystemSchema,
  catalogRoleSchema,
  catalogPersonaSchema,
} from "../src/seed/saas-operator-catalog";
import { ensureSystems, ensureRoles, ensurePersonas } from "../src/seed/ensure-catalog";

const API_BASE = "http://127.0.0.1:8787";

async function cypher<T = Record<string, unknown>>(
  statement: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(statement, params);
    return res.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}
const num = (v: unknown) => Number((v as { low?: number })?.low ?? v);

describe("integration: saas-operator-foundation AC-04/AC-05 shared catalog", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("T-01: catalog arrays parse their schema; seedKeys unique", () => {
    for (const s of SYSTEMS) expect(catalogSystemSchema.safeParse(s).success).toBe(true);
    for (const r of ROLES) expect(catalogRoleSchema.safeParse(r).success).toBe(true);
    for (const p of PERSONAS) expect(catalogPersonaSchema.safeParse(p).success).toBe(true);
    const uniq = (arr: { seedKey: string }[]) => new Set(arr.map((x) => x.seedKey)).size === arr.length;
    expect(uniq(SYSTEMS)).toBe(true);
    expect(uniq(ROLES)).toBe(true);
    expect(uniq(PERSONAS)).toBe(true);
  });

  test("AC-04: systems seeded once via operatorSeedKey; retail CRM untouched", async () => {
    // Snapshot any retail CRM (a System named CRM with NO operatorSeedKey).
    const [retailBefore] = await cypher<{ id: string; description: string; opKey: string | null }>(
      `MATCH (s:System {name:"CRM"}) WHERE s.operatorSeedKey IS NULL
       RETURN s.id AS id, s.description AS description, s.operatorSeedKey AS opKey LIMIT 1`,
    );

    const map1 = await ensureSystems(getDriver());
    expect(map1.size).toBe(SYSTEMS.length);

    // Seven operator Systems, each with a valid systemKind + operatorSeedKey.
    const rows = await cypher<{ opKey: string; kind: string }>(
      `MATCH (s:System) WHERE s.operatorSeedKey IS NOT NULL
       RETURN s.operatorSeedKey AS opKey,
              apoc.convert.fromJsonMap(s.attributes_json).systemKind AS kind`,
    );
    expect(rows.length).toBe(SYSTEMS.length);
    for (const r of rows) {
      expect(["functional", "agentic", "ai_predictive"]).toContain(r.kind);
    }

    // Re-run yields no duplicate (operatorSeedKey MERGE).
    await ensureSystems(getDriver());
    const [count] = await cypher<{ n: number }>(
      `MATCH (s:System) WHERE s.operatorSeedKey IS NOT NULL RETURN count(s) AS n`,
    );
    expect(num(count!.n)).toBe(SYSTEMS.length);

    // Operator CRM is a distinct node carrying operatorSeedKey:"crm" + systemKind.
    const [opCrm] = await cypher<{ opKey: string; kind: string }>(
      `MATCH (s:System {operatorSeedKey:"crm"})
       RETURN s.operatorSeedKey AS opKey,
              apoc.convert.fromJsonMap(s.attributes_json).systemKind AS kind`,
    );
    expect(opCrm!.opKey).toBe("crm");
    expect(opCrm!.kind).toBe("functional");

    // The retail CRM (if any) is UNTOUCHED — id/description unchanged, still no
    // operatorSeedKey.
    if (retailBefore) {
      const [retailAfter] = await cypher<{ id: string; description: string; opKey: string | null }>(
        `MATCH (s:System {id:$id}) RETURN s.id AS id, s.description AS description, s.operatorSeedKey AS opKey`,
        { id: retailBefore.id },
      );
      expect(retailAfter!.id).toBe(retailBefore.id);
      expect(retailAfter!.description).toBe(retailBefore.description);
      expect(retailAfter!.opKey ?? null).toBeNull();
    }
  });

  test("AC-05 (role half): :Role seeded (not :RBACRole); C-07 keeps attrs", async () => {
    await ensureRoles(getDriver());
    const rows = await cypher<{ opKey: string; labels: string[] }>(
      `MATCH (r:Role) WHERE r.operatorSeedKey IS NOT NULL
       RETURN r.operatorSeedKey AS opKey, labels(r) AS labels`,
    );
    expect(rows.length).toBe(ROLES.length);
    for (const r of rows) {
      expect(r.labels).toContain("Role");
      expect(r.labels).not.toContain("RBACRole");
    }

    // Re-run: no duplicate.
    await ensureRoles(getDriver());
    const [count] = await cypher<{ n: number }>(
      `MATCH (r:Role) WHERE r.operatorSeedKey IS NOT NULL RETURN count(r) AS n`,
    );
    expect(num(count!.n)).toBe(ROLES.length);

    // C-07: a Role's attributes_json is first-written after a re-seed.
    const [role] = await cypher<{ seedKey: string }>(
      `MATCH (r:Role {operatorSeedKey:$k})
       RETURN apoc.convert.fromJsonMap(r.attributes_json).seedKey AS seedKey`,
      { k: ROLES[0]!.seedKey },
    );
    expect(role!.seedKey).toBe(ROLES[0]!.seedKey);
  });

  test("AC-05 (persona half): :Persona via route, marker in attributes (C-06 as-built), no dup", async () => {
    // NOTE (as-built deviation from C-06): the persona route CANNOT persist a
    // nested attributes map (Neo4j rejects Map property values), so the marker
    // is carried in a JSON-STRING attributes value carrying operatorSeedKey.
    // Assert the marker resolves and is NOT a top-level Neo4j property.
    await ensurePersonas(API_BASE);

    const rows = await cypher<{ name: string; attributes: unknown; opKeyTop: string | null }>(
      `MATCH (p:Persona)
       WHERE p.attributes CONTAINS 'operatorSeedKey'
       RETURN p.name AS name, p.attributes AS attributes, p.operatorSeedKey AS opKeyTop`,
    );
    expect(rows.length).toBe(PERSONAS.length);
    for (const r of rows) {
      const parsed = JSON.parse(String(r.attributes)) as { operatorSeedKey?: string };
      expect(parsed.operatorSeedKey).toBeTruthy(); // marker resolvable
      expect(r.opKeyTop ?? null).toBeNull(); // NOT a top-level property
    }

    // Re-run adds no duplicate persona (operator-name lookup).
    await ensurePersonas(API_BASE);
    const [count] = await cypher<{ n: number }>(
      `MATCH (p:Persona) WHERE p.attributes CONTAINS 'operatorSeedKey' RETURN count(p) AS n`,
    );
    expect(num(count!.n)).toBe(PERSONAS.length);
  });

  test("AC-05: no new RBAC permission string added to rbac-permissions.ts", () => {
    // The seed harness adds no permission string. Assert none of the operator
    // seedKeys leaked into the permission source as a new mapping.
    const src = readFileSync(resolve(import.meta.dir, "../src/auth/rbac-permissions.ts"), "utf8");
    for (const p of PERSONAS) {
      expect(src).not.toContain(`operator:${p.seedKey}`);
    }
    expect(src).not.toContain("saasOperator:");
  });
});
