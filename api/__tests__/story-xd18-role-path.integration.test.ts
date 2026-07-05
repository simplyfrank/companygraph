// story-spec-core T-17 / AC-19 (design §4.12, executed with the D-6
// transport errata) — the XD-18 end-to-end path: a REAL
// business_architect session authorized through the central router
// gate, over a (:Role)-[:EXECUTES]->(:Activity) structure with ≥2
// activities and DISTINCT executing roles → bootstrap → one
// derived:true story per activity with DESCRIBES_ACTIVITY +
// STORY_FOR_ROLE to its executing role + one starter GWT AC → hand
// edit of one AC clause → 200 + derived clears. Step 6 carries the
// e2e 403/200 half of AC-09 (D-7).
//
// Transport (task-review B-01 pin — binding): every request is
// dispatched IN-PROCESS through the exported `route(req)` — the exact
// function Bun.serve wraps in server.ts — so the identical gate path
// runs (dispatch → cookie parse → getSession → getRoutePermission →
// hasPermissionByRbac) against the real Neo4j driver. Why not the
// external server: with ONELOGIN_ISSUER unset the gate short-circuits
// to devSession() (permissions ["*"], cookie never parsed — silently
// vacuous); with it set, sessions live in a per-process in-memory Map
// (oauth.ts), so a cookie minted here would 401 against a separate
// server process. NO production code change, NO permission stub.

// ONELOGIN_ISSUER is set BEFORE the router module is imported (B-01
// pin): the router is loaded via dynamic import below, after this
// assignment runs, so no code path ever observes the dev-fallback
// configuration.
process.env.ONELOGIN_ISSUER = "https://test.invalid";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createSession } from "../src/auth/oauth";
import { seedRbacRoles } from "../src/scripts/seed-rbac-roles";
import { registerStorySchema } from "../src/scripts/register-story-labels";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";

// Dynamic import AFTER the env assignment (module bodies run after
// their static imports — a static router import would evaluate first).
const { route } = await import("../src/router");

const BASE = "http://127.0.0.1:8787/api/v1";

interface StoryRes {
  id: string;
  derived: boolean;
  activityId: string | null;
  roleId?: string | null;
  detached: boolean;
  acceptanceCriteria?: Array<{
    id: string;
    given: string;
    when: string;
    then: string;
    ordinal: number;
    derived: boolean;
  }>;
}

let adminCookie: string;
let architectCookie: string;
let readOnlyCookie: string;
let modelId: string;
let domainId: string;
let journeyId: string;
const activityIds: string[] = [];
const roleIds: string[] = [];
const cleanupNodes: Array<{ label: string; id: string }> = [];

async function call(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await route(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        cookie: `session=${cookie}`,
        "content-type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text.length > 0 ? JSON.parse(text) : null };
}

describe("integration: story-spec-core AC-19 XD-18 role→activity→story end-to-end path", () => {
  beforeAll(async () => {
    // Self-heal: sibling ontology tests in the shared suite wipe +
    // const-reseed the registry; re-ensure the story labels/edges
    // exist before dispatching (idempotent; this file's in-process
    // dispatch shares this process's caches, so a direct-driver
    // re-registration is sufficient here).
    await registerStorySchema(getDriver());

    // Real RBAC seed (idempotent MERGE) so business_architect carries
    // story:read + story:write.
    await seedRbacRoles();

    // Admin session for FIXTURE SEEDING ONLY — still a real session
    // through the real gate, no stub.
    adminCookie = await createSession(
      { sub: "xd18-admin", name: "XD18 Admin", email: "admin@test.invalid" },
      ["admin"],
      ["*"],
      [],
      ["admin"],
      ["*"],
    );

    // The Business Architect session: the REAL seeded permission set of
    // the business_architect RBAC role, read from Neo4j.
    const session = getDriver().session({ defaultAccessMode: "READ" });
    let architectPermissions: string[];
    try {
      const r = await session.run(
        `MATCH (r:RBACRole {name: "business_architect"}) RETURN r.permissions AS permissions`,
      );
      architectPermissions = r.records[0]!.get("permissions") as string[];
    } finally {
      await session.close();
    }
    expect(architectPermissions).toContain("story:read");
    expect(architectPermissions).toContain("story:write");
    architectCookie = await createSession(
      { sub: "xd18-architect", name: "Business Architect", email: "architect@test.invalid" },
      [],
      ["*"],
      [],
      ["business_architect"],
      architectPermissions,
    );

    // Third session WITHOUT story:write (D-7 gate negative).
    readOnlyCookie = await createSession(
      { sub: "xd18-readonly", name: "Story Reader", email: "reader@test.invalid" },
      [],
      ["*"],
      [],
      [],
      ["story:read"],
    );

    // Fixture (API-only, design §8 — same in-process transport, admin
    // session): a model with 2 activities, each with a DISTINCT
    // executing Role.
    const model = await call(adminCookie, "POST", "/models", { name: "xd18-model" });
    expect(model.status).toBe(201);
    modelId = model.body.id;
    const domain = await call(adminCookie, "POST", `/models/${modelId}/domains`, {
      name: "xd18-domain",
    });
    expect(domain.status).toBe(201);
    domainId = domain.body.id;

    const journey = await call(adminCookie, "POST", "/nodes/UserJourney", {
      name: "xd18-journey",
    });
    expect(journey.status).toBe(201);
    journeyId = journey.body.id;
    cleanupNodes.push({ label: "UserJourney", id: journeyId });
    expect(
      (await call(adminCookie, "POST", "/edges", { type: "PART_OF", fromId: journeyId, toId: domainId }))
        .status,
    ).toBe(201);

    for (const n of [1, 2]) {
      const act = await call(adminCookie, "POST", "/nodes/Activity", { name: `xd18-act-${n}` });
      expect(act.status).toBe(201);
      activityIds.push(act.body.id);
      cleanupNodes.push({ label: "Activity", id: act.body.id });
      expect(
        (await call(adminCookie, "POST", "/edges", { type: "PART_OF", fromId: act.body.id, toId: journeyId }))
          .status,
      ).toBe(201);

      const role = await call(adminCookie, "POST", "/nodes/Role", { name: `xd18-role-${n}` });
      expect(role.status).toBe(201);
      roleIds.push(role.body.id);
      cleanupNodes.push({ label: "Role", id: role.body.id });
      expect(
        (await call(adminCookie, "POST", "/edges", { type: "EXECUTES", fromId: role.body.id, toId: act.body.id }))
          .status,
      ).toBe(201);
    }
  });

  afterAll(async () => {
    // Stories first (a leftover detached story pollutes every list).
    const list = await call(adminCookie, "GET", `/models/${modelId}/stories`);
    if (list.status === 200) {
      for (const s of list.body as StoryRes[]) {
        await call(adminCookie, "DELETE", `/models/${modelId}/stories/${s.id}`);
      }
    }
    await call(adminCookie, "DELETE", `/models/${modelId}`);
    for (const { label, id } of cleanupNodes) {
      await call(adminCookie, "DELETE", `/nodes/${label}/${id}?cascade=true`);
    }
    delete process.env.ONELOGIN_ISSUER; // don't leak into sibling test files
    await closeDriver();
    _resetDriver();
  });

  test("gate sanity: no cookie → 401; unknown cookie → 401 (the gate really parses the cookie)", async () => {
    const bare = await route(new Request(`${BASE}/models/${modelId}/stories`));
    expect(bare.status).toBe(401);
    const bogus = await call("does-not-exist", "GET", `/models/${modelId}/stories`);
    expect(bogus.status).toBe(401);
  });

  test("bootstrap as business_architect → one derived story per activity, STORY_FOR_ROLE to its EXECUTING role, one starter GWT AC each", async () => {
    const boot = await call(architectCookie, "POST", `/models/${modelId}/stories/bootstrap`);
    expect(boot.status).toBe(200);
    expect(boot.body).toEqual({ created: 2, skipped: 0 });

    const list = await call(architectCookie, "GET", `/models/${modelId}/stories`);
    expect(list.status).toBe(200);
    const mine = (list.body as StoryRes[]).filter((s) =>
      activityIds.includes(s.activityId ?? ""),
    );
    expect(mine.length).toBe(2);

    for (let i = 0; i < activityIds.length; i++) {
      const story = mine.find((s) => s.activityId === activityIds[i])!;
      expect(story.derived).toBe(true);
      // The EXECUTES structure drives §4.5's primary-role selection:
      // each story is FOR its activity's DISTINCT executing role.
      expect(story.roleId).toBe(roleIds[i]!);

      const detail = await call(
        architectCookie,
        "GET",
        `/models/${modelId}/stories/${story.id}`,
      );
      expect(detail.status).toBe(200);
      const acs = (detail.body as StoryRes).acceptanceCriteria!;
      expect(acs.length).toBe(1);
      expect(acs[0]!.derived).toBe(true);
      expect(acs[0]!.ordinal).toBe(1);
      expect(acs[0]!.when).toBe(`the xd18-role-${i + 1} performs xd18-act-${i + 1}`);
    }
  });

  test("hand edit: PATCH one starter AC clause as the same session → 200 + derived clears (DD-05)", async () => {
    const list = await call(architectCookie, "GET", `/models/${modelId}/stories`);
    const story = (list.body as StoryRes[]).find((s) => s.activityId === activityIds[0])!;
    const detail = await call(architectCookie, "GET", `/models/${modelId}/stories/${story.id}`);
    const ac = (detail.body as StoryRes).acceptanceCriteria![0]!;
    expect(ac.derived).toBe(true);

    const patched = await call(
      architectCookie,
      "PATCH",
      `/models/${modelId}/stories/${story.id}/acceptance-criteria/${ac.id}`,
      { then: "the xd18 workflow advances measurably" },
    );
    expect(patched.status).toBe(200);
    expect(patched.body.then).toBe("the xd18 workflow advances measurably");
    expect(patched.body.derived).toBe(false);
  });

  test("gate negative (D-7): a session without story:write → 403 on bootstrap POST + story POST, 200 on list GET", async () => {
    const boot = await call(readOnlyCookie, "POST", `/models/${modelId}/stories/bootstrap`);
    expect(boot.status).toBe(403);

    const create = await call(readOnlyCookie, "POST", `/models/${modelId}/stories`, {
      persona: "Sneaky",
      action: "write without permission",
      benefit: "the gate is bypassed",
      activityId: activityIds[0],
    });
    expect(create.status).toBe(403);

    const list = await call(readOnlyCookie, "GET", `/models/${modelId}/stories`);
    expect(list.status).toBe(200);
  });
});
