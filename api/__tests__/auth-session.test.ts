// auth-hardening T-04 + T-06 — session lifecycle pins (FR-06, AC-07) and the
// DEC-05 session-backing assertion outcome (FR-11, AC-15). Pure unit tests:
// the session store is the module-level in-memory Map (oauth.ts), and
// assertSessionBacking is driven with injected env objects (no process.env
// mutation, no network, no Neo4j).

import { describe, expect, test } from "bun:test";
import { createSession, getSession, deleteSession } from "../src/auth/oauth";
import type { UserInfo, UserSession } from "../src/auth/oauth";
import { getSessionStorage } from "../src/auth/redis-session";
import { assertSessionBacking } from "../src/auth/dev-fallback";
import type { Env } from "../src/env";

const USER: UserInfo = { sub: "sess-user", name: "Sess User", email: "sess@test.invalid" };

// A representative env; only host/authDevFallback matter to the assertion.
function env(overrides: Partial<Env>): Env {
  return {
    host: "127.0.0.1",
    apiPort: 8787,
    neo4jUri: "bolt://127.0.0.1:7687",
    neo4jUser: "neo4j",
    neo4jPassword: "x",
    postgresUri: "postgresql://x",
    anthropicApiKey: null,
    chatDbPath: "./x",
    analyticsDbPath: "./x",
    authDevFallback: false,
    ...overrides,
  };
}

describe("auth-hardening session lifecycle (AC-07 / FR-06)", () => {
  test("createSession → getSession round-trips the six carried fields", async () => {
    const personaAssignments = [{ personaId: "p1", personaName: "P1", domainIds: ["d1"] }];
    const rbacRoles = ["role-a", "role-b"];
    const permissions = ["kpi:read", "kpi:write"];
    const storeAccess = ["store-1", "store-2"];
    const roles = ["viewer"];

    const id = await createSession(USER, roles, storeAccess, personaAssignments, rbacRoles, permissions);
    const session = await getSession(id);

    expect(session).not.toBeNull();
    expect(session!.userId).toBe(USER.sub);
    expect(session!.email).toBe(USER.email);
    expect(session!.name).toBe(USER.name);
    expect(session!.roles).toEqual(roles);
    expect(session!.storeAccess).toEqual(storeAccess);
    expect(session!.personaAssignments).toEqual(personaAssignments);
    expect(session!.rbacRoles).toEqual(rbacRoles);
    expect(session!.permissions).toEqual(permissions);
    // expiresAt ≈ now + 8h.
    const eightHours = 8 * 60 * 60 * 1000;
    expect(session!.expiresAt).toBeGreaterThan(Date.now() + eightHours - 5000);
    expect(session!.expiresAt).toBeLessThanOrEqual(Date.now() + eightHours + 5000);
  });

  test("getSession returns null after expiresAt", async () => {
    // Store a session whose expiresAt is already in the past (directly via
    // the same backing getSession reads), then assert getSession → null.
    const expired: UserSession = {
      userId: USER.sub,
      email: USER.email,
      name: USER.name,
      roles: [],
      storeAccess: ["*"],
      personaAssignments: [],
      rbacRoles: [],
      permissions: ["*"],
      expiresAt: Date.now() - 1,
    };
    const id = "expired-session-fixture";
    await getSessionStorage().set(id, expired);
    const after = await getSession(id);
    expect(after).toBeNull();
  });

  test("deleteSession removes the session", async () => {
    const id = await createSession(USER, [], ["*"], [], [], ["*"]);
    expect(await getSession(id)).not.toBeNull();
    await deleteSession(id);
    expect(await getSession(id)).toBeNull();
  });

  test("unknown session id → null", async () => {
    expect(await getSession("no-such-session")).toBeNull();
  });
});

describe("auth-hardening session backing assertion (AC-15 / FR-11 / DEC-05)", () => {
  test("throws for a non-loopback env on the in-memory stub", () => {
    expect(() => assertSessionBacking(env({ host: "10.0.0.5" }))).toThrow(
      /not loopback but session storage is the in-memory stub/,
    );
  });

  test("does NOT throw for a loopback env (127.0.0.1)", () => {
    expect(() => assertSessionBacking(env({ host: "127.0.0.1" }))).not.toThrow();
  });

  test("does NOT throw for loopback WITH ONELOGIN_ISSUER set (C-02 — JWKS smoke-test path boots)", () => {
    const prev = process.env.ONELOGIN_ISSUER;
    process.env.ONELOGIN_ISSUER = "https://issuer.test.invalid";
    try {
      // assertSessionBacking keys on host alone, not issuer — loopback boots
      // regardless of issuer (single-process Map is a correct backing there).
      expect(() => assertSessionBacking(env({ host: "127.0.0.1" }))).not.toThrow();
      expect(() => assertSessionBacking(env({ host: "localhost" }))).not.toThrow();
      expect(() => assertSessionBacking(env({ host: "::1" }))).not.toThrow();
    } finally {
      if (prev === undefined) delete process.env.ONELOGIN_ISSUER;
      else process.env.ONELOGIN_ISSUER = prev;
    }
  });
});
