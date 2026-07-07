// auth-hardening T-06 (AC-08 / FR-07) — permission resolution pins.
// Seeds a real User→HAS_PERSONA→Persona→HAS_RBAC_ROLE→RBACRole graph
// (including ONE PARENT_OF inheritance edge between two RBAC-role-bearing
// personas) via the production getDriver(), then asserts
// resolveUserPermissions returns the deduped union of DIRECT + inherited
// permissions/roles and the persona domainIds. Also pins the driver-error
// fail-closed path (catch → all-empty). Cleans up by seeded id.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { resolveUserPermissions } from "../src/auth/permission-resolver";

const USER_ID = "authhardening-resolver-user";
const CHILD_PERSONA = "authhardening-persona-child";
const PARENT_PERSONA = "authhardening-persona-parent";
const CHILD_ROLE = "authhardening-role-child";
const PARENT_ROLE = "authhardening-role-parent";
const DOMAIN_IDS = ["domain-a", "domain-b"];

describe("integration: auth-hardening permission resolver (AC-08 / FR-07)", () => {
  beforeAll(async () => {
    const s = getDriver().session({ defaultAccessMode: "WRITE" });
    try {
      await s.run(
        `
        MERGE (u:User {id: $userId})
        MERGE (child:Persona {id: $childPersona}) SET child.name = "Child Persona", child.archivedAt = null
        MERGE (parent:Persona {id: $parentPersona}) SET parent.name = "Parent Persona", parent.archivedAt = null
        MERGE (cr:RBACRole {id: $childRole}) SET cr.name = "child-role", cr.permissions = ["kpi:read", "shared:perm"]
        MERGE (pr:RBACRole {id: $parentRole}) SET pr.name = "parent-role", pr.permissions = ["okr:write", "shared:perm"]
        MERGE (u)-[hp:HAS_PERSONA]->(child) SET hp.domainIds = $domainIds
        MERGE (child)-[:HAS_RBAC_ROLE]->(cr)
        MERGE (parent)-[:HAS_RBAC_ROLE]->(pr)
        MERGE (parent)-[:PARENT_OF]->(child)
        `,
        {
          userId: USER_ID,
          childPersona: CHILD_PERSONA,
          parentPersona: PARENT_PERSONA,
          childRole: CHILD_ROLE,
          parentRole: PARENT_ROLE,
          domainIds: DOMAIN_IDS,
        },
      );
    } finally {
      await s.close();
    }
  });

  afterAll(async () => {
    const s = getDriver().session({ defaultAccessMode: "WRITE" });
    try {
      await s.run(
        `
        MATCH (u:User {id: $userId}) DETACH DELETE u
        `,
        { userId: USER_ID },
      );
      await s.run(
        `MATCH (n) WHERE n.id IN $ids DETACH DELETE n`,
        { ids: [CHILD_PERSONA, PARENT_PERSONA, CHILD_ROLE, PARENT_ROLE] },
      );
    } finally {
      await s.close();
    }
    await closeDriver();
    _resetDriver();
  });

  test("resolves the deduped union of direct + PARENT_OF-inherited roles + permissions", async () => {
    const resolved = await resolveUserPermissions(USER_ID);

    // Direct (child-role) + inherited (parent-role via PARENT_OF).
    expect(resolved.permissions.sort()).toEqual(["kpi:read", "okr:write", "shared:perm"].sort());
    // shared:perm appears in both roles → deduped to one entry.
    expect(resolved.permissions.filter((p) => p === "shared:perm").length).toBe(1);

    expect(resolved.rbacRoles.sort()).toEqual([CHILD_ROLE, PARENT_ROLE].sort());
    expect(resolved.rbacRoles.filter((r) => r === CHILD_ROLE).length).toBe(1);

    // personaAssignments carry the domainIds from the HAS_PERSONA edge.
    expect(resolved.personaAssignments.length).toBe(1);
    expect(resolved.personaAssignments[0]!.personaId).toBe(CHILD_PERSONA);
    expect(resolved.personaAssignments[0]!.domainIds.sort()).toEqual([...DOMAIN_IDS].sort());
  });

  test("driver error → all-empty (fail-closed, permission-resolver.ts catch)", async () => {
    // Force a driver error hermetically: point the URI at an unreachable
    // address and rebuild the singleton, so session.run() throws inside
    // resolveUserPermissions and the catch returns all-empty arrays.
    const prevUri = process.env.NEO4J_URI;
    await closeDriver();
    _resetDriver();
    process.env.NEO4J_URI = "bolt://127.0.0.1:1"; // nothing listening
    try {
      const resolved = await resolveUserPermissions(USER_ID);
      expect(resolved).toEqual({ personaAssignments: [], rbacRoles: [], permissions: [] });
    } finally {
      // Restore the real driver for afterAll cleanup.
      await closeDriver();
      _resetDriver();
      if (prevUri === undefined) delete process.env.NEO4J_URI;
      else process.env.NEO4J_URI = prevUri;
    }
  });
});
