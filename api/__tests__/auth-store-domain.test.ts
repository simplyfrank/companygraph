// auth-hardening T-07 (AC-09 / FR-08 / DEC-04) — pins the PURE logic of the
// store/domain gating helpers that are UNWIRED as-built. The router gate
// (router.ts dispatch) calls ONLY getSession + hasPermissionByRbac — it does
// NOT consult hasStoreAccess / hasDomainAccess / withStoreAccess. These
// helpers are documented dead code (_baseline FR-05 over-claims them as
// enforced). DEC-04: this spec keeps them latent + tested, does NOT wire
// them (wiring is a new tenancy feature). A future wiring becomes a visible
// contract change against these pins + the negative assertion below.

import { describe, expect, test } from "bun:test";
import {
  hasStoreAccess,
  hasPermissionByRbac,
  withStoreAccess,
} from "../src/auth/oauth";
import { hasDomainAccess } from "../src/auth/permission-resolver";

describe("auth-hardening store access helper (hasStoreAccess — unwired, FR-08)", () => {
  test("* wildcard grants any store", () => {
    expect(hasStoreAccess(["*"], "any-store")).toBe(true);
  });
  test("exact membership grants that store", () => {
    expect(hasStoreAccess(["store-1", "store-2"], "store-2")).toBe(true);
  });
  test("non-member store is denied", () => {
    expect(hasStoreAccess(["store-1"], "store-2")).toBe(false);
  });
  test("empty access denies", () => {
    expect(hasStoreAccess([], "store-1")).toBe(false);
  });
});

describe("auth-hardening domain access helper (hasDomainAccess — unwired, FR-08)", () => {
  const assign = (domainIds: string[]) => [{ personaId: "p", personaName: "P", domainIds }];
  test("persona-domain * wildcard grants any domain", () => {
    expect(hasDomainAccess(assign(["*"]), "any-domain")).toBe(true);
  });
  test("persona-domain membership grants that domain", () => {
    expect(hasDomainAccess(assign(["d1", "d2"]), "d2")).toBe(true);
  });
  test("non-member domain denied", () => {
    expect(hasDomainAccess(assign(["d1"]), "d2")).toBe(false);
  });
  test("no assignments → denied", () => {
    expect(hasDomainAccess([], "d1")).toBe(false);
  });
});

describe("auth-hardening hasPermissionByRbac (exact / resource:* / * — FR-02/FR-08)", () => {
  test("* wildcard grants any permission", () => {
    expect(hasPermissionByRbac(["*"], "anything:here")).toBe(true);
  });
  test("exact match grants", () => {
    expect(hasPermissionByRbac(["domain:read"], "domain:read")).toBe(true);
  });
  test("resource:* prefix grants same-resource permission", () => {
    expect(hasPermissionByRbac(["domain:*"], "domain:read")).toBe(true);
  });
  test("resource:* does NOT grant a different resource", () => {
    expect(hasPermissionByRbac(["domain:*"], "kpi:read")).toBe(false);
  });
  test("missing permission denied", () => {
    expect(hasPermissionByRbac(["kpi:read"], "domain:read")).toBe(false);
  });
});

describe("auth-hardening withStoreAccess factory 403-vs-pass composition (unwired, FR-08)", () => {
  const handler = async () => new Response("ok", { status: 200 });

  // Drive the factory with a synthetic `req` object (no HTTP). withStoreAccess
  // reads req.user, req.url (query param), and req.params for the store id.
  function req(user: any, storeId?: string): any {
    const url = storeId
      ? `http://127.0.0.1/api/v1/x?storeId=${storeId}`
      : `http://127.0.0.1/api/v1/x`;
    return { user, url, headers: new Headers() };
  }

  test("no req.user → 401", async () => {
    const res = await withStoreAccess()(handler)(req(undefined));
    expect(res.status).toBe(401);
  });

  test("user with * store access + a storeId param → passes", async () => {
    const res = await withStoreAccess()(handler)(
      req({ storeAccess: ["*"], personaAssignments: [] }, "store-9"),
    );
    expect(res.status).toBe(200);
  });

  test("user without the store AND without persona-domain access → 403", async () => {
    const res = await withStoreAccess()(handler)(
      req({ storeAccess: ["store-1"], personaAssignments: [] }, "store-9"),
    );
    expect(res.status).toBe(403);
  });

  test("persona-domain fallback grants access when storeAccess misses", async () => {
    const res = await withStoreAccess()(handler)(
      req(
        {
          storeAccess: ["store-1"],
          personaAssignments: [{ personaId: "p", personaName: "P", domainIds: ["store-9"] }],
        },
        "store-9",
      ),
    );
    expect(res.status).toBe(200);
  });

  test("no storeId in the request → passes (nothing to gate)", async () => {
    const res = await withStoreAccess()(handler)(req({ storeAccess: [], personaAssignments: [] }));
    expect(res.status).toBe(200);
  });
});

// Negative assertion (design §4.6 / DEC-04): the router gate does NOT consult
// store/domain gating. Nothing outside api/src/auth/** (and routes/auth.ts)
// imports these helpers, and router.ts's dispatch only calls
// hasPermissionByRbac. Pinned here so a future wiring is a visible change.
describe("auth-hardening store/domain gating is UNWIRED at the gate (DEC-04)", () => {
  test("router.ts does not import the store/domain gating helpers", () => {
    const src = require("fs").readFileSync(
      require("path").join(import.meta.dir, "..", "src", "router.ts"),
      "utf8",
    );
    expect(src.includes("withStoreAccess")).toBe(false);
    expect(src.includes("hasStoreAccess")).toBe(false);
    expect(src.includes("hasDomainAccess")).toBe(false);
  });
});
