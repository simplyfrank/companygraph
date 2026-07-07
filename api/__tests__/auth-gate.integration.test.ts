// auth-hardening T-04 — central-gate contract pins (FR-01/02/03/06, FR-12).
// Closes AC-01/02/03/04. Exercises the REAL router gate in-process through
// the exported `route(req)` (the exact function Bun.serve wraps) with
// ONELOGIN_ISSUER SET to a test double, so the authenticated happy/deny
// paths are observable (the default unset mode short-circuits to the dev
// fallback). No network egress — sessions live in the process's in-memory
// Map (oauth.ts), minted with createSession, and read back through the gate.
//
// Env discipline (design §4.11 / C-04): ONELOGIN_ISSUER + AUTH_DEV_FALLBACK
// are set BEFORE the mandatory dynamic import of the router and deleted in
// afterAll, so no stale-env hoist and no leak into sibling files sharing the
// one bun-test process.

const PREV_FALLBACK = process.env.AUTH_DEV_FALLBACK; // restore in afterAll (T-10 preload)
process.env.ONELOGIN_ISSUER = "https://test.invalid";
delete process.env.AUTH_DEV_FALLBACK; // issuer set → fallback must be inert

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createSession } from "../src/auth/oauth";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";

// Dynamic import AFTER the env assignments (a static router import would
// evaluate its module body before these lines).
const { route } = await import("../src/router");

const BASE = "http://127.0.0.1:8787/api/v1";

// A non-public, permissioned route used to prove the 401-vs-403 branch
// split on ONE route. GET /domains → "domain:read" (rbac-permissions.ts).
const GUARDED_PATH = "/domains";
const GUARDED_PERMISSION = "domain:read";

let validCookie: string; // has domain:read → dispatched
let insufficientCookie: string; // lacks domain:read → 403
let wildcardCookie: string; // "*" → dispatched
let resourceWildcardCookie: string; // "domain:*" → dispatched
let exactCookie: string; // exactly "domain:read" → dispatched
let expiredSessionId: string;

async function mint(permissions: string[], sub = "gate-test"): Promise<string> {
  return createSession(
    { sub, name: "Gate Test", email: `${sub}@test.invalid` },
    [],
    ["*"],
    [],
    [],
    permissions,
  );
}

async function call(
  cookie: string | null,
  method: string,
  path: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = `session=${cookie}`;
  const res = await route(new Request(`${BASE}${path}`, { method, headers }));
  const text = await res.text();
  return { status: res.status, body: text.length > 0 ? JSON.parse(text) : null };
}

describe("integration: auth-hardening central gate (AC-01/02/03/04)", () => {
  beforeAll(async () => {
    validCookie = await mint([GUARDED_PERMISSION], "gate-valid");
    insufficientCookie = await mint(["some:other"], "gate-insufficient");
    wildcardCookie = await mint(["*"], "gate-wildcard");
    resourceWildcardCookie = await mint(["domain:*"], "gate-resource-wildcard");
    exactCookie = await mint(["domain:read"], "gate-exact");
    // A session already past expiry — createSession sets now+8h, so mint
    // then delete is not "expired". Instead assert the unknown-id path
    // covers the null-session branch; the expired branch is pinned in
    // auth-session.test.ts (getSession null-after-expiry). Here we assert
    // an unknown id → 401 (the gate's getSession==null branch).
    expiredSessionId = "expired-or-unknown-session-id";
  });

  afterAll(async () => {
    delete process.env.ONELOGIN_ISSUER;
    // Restore (not blind-delete) the T-10 preload's AUTH_DEV_FALLBACK so sibling
    // integration tests that ride the dev fallback stay green (env discipline).
    if (PREV_FALLBACK === undefined) delete process.env.AUTH_DEV_FALLBACK;
    else process.env.AUTH_DEV_FALLBACK = PREV_FALLBACK;
    await closeDriver();
    _resetDriver();
  });

  // AC-01 — no cookie → 401, downstream not invoked.
  test("no session cookie → 401 Unauthorized (FR-01)", async () => {
    const res = await call(null, "GET", GUARDED_PATH);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  // AC-02 — unknown / unresolvable session id → 401.
  test("unknown session id → 401 Unauthorized (FR-01)", async () => {
    const res = await call(expiredSessionId, "GET", GUARDED_PATH);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  // AC-03 — 401 (missing session) and 403 (missing permission) are DISTINCT
  // outcomes on the SAME route.
  test("valid session lacking the route permission → 403 Forbidden (FR-02)", async () => {
    const res = await call(insufficientCookie, "GET", GUARDED_PATH);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden" });
  });

  test("401 (no session) and 403 (insufficient perm) are distinct on one route", async () => {
    const missing = await call(null, "GET", GUARDED_PATH);
    const insufficient = await call(insufficientCookie, "GET", GUARDED_PATH);
    expect(missing.status).toBe(401);
    expect(insufficient.status).toBe(403);
  });

  // AC-02/03 — satisfying permission (exact, resource:*, and *) → dispatched
  // (NOT 401/403). A 200 (or any non-401/403) proves the gate admitted it and
  // ran the downstream handler with req.user attached.
  test("satisfying permission dispatches: exact match (FR-02)", async () => {
    const res = await call(exactCookie, "GET", GUARDED_PATH);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test("satisfying permission dispatches: resource:* prefix (FR-02)", async () => {
    const res = await call(resourceWildcardCookie, "GET", GUARDED_PATH);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test("satisfying permission dispatches: * wildcard (FR-02)", async () => {
    const res = await call(wildcardCookie, "GET", GUARDED_PATH);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  // AC-04 — public routes dispatch with NO session even with an issuer set.
  test("public routes dispatch with no session (FR-03)", async () => {
    const healthz = await call(null, "GET", "/healthz");
    expect(healthz.status).not.toBe(401);
    expect(healthz.status).not.toBe(403);

    const openapi = await call(null, "GET", "/openapi.json");
    expect(openapi.status).not.toBe(401);
    expect(openapi.status).not.toBe(403);
  });

  // AC-04 — auth/me is NOT public; without a session → 401.
  test("auth/me is not public — no session → 401 (FR-03)", async () => {
    const res = await call(null, "GET", "/auth/me");
    expect(res.status).toBe(401);
  });
});
