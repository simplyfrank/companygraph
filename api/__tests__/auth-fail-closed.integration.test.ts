// auth-hardening T-08 (AC-10/11/12/14 / FR-09/FR-10/FR-13) — the
// SECURITY-CRITICAL fail-closed regressions. These are the tests that catch a
// re-introduction of the silent-admin hole.
//
// Each case sets env EXPLICITLY (never relying on the T-10 preload) so it
// observes the TRUE hardened default. Both the router's issuer read
// (process.env.ONELOGIN_ISSUER, per request) and devFallbackEligible()'s
// posture read (HOST / AUTH_DEV_FALLBACK from process.env, per call) are
// evaluated per request, so mutating process.env between cases is sufficient
// with a single dynamic router import. All mutated vars are cleared in
// afterAll (env discipline — design §4.11 / C-04) so nothing leaks into
// sibling files.

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { assertAuthPosture, devFallbackEligible } from "../src/auth/dev-fallback";

// Dynamic import AFTER a clean env baseline (no static top-of-file router
// import — that would hoist above the env work below).
delete process.env.ONELOGIN_ISSUER;
delete process.env.AUTH_DEV_FALLBACK;
delete process.env.HOST;
const { route } = await import("../src/router");

const BASE = "http://127.0.0.1:8787/api/v1";
const GUARDED_PATH = "/domains"; // non-public (domain:read)

// Pre-test env snapshot — restore (not blind-delete) so this file never
// clobbers the T-10 preload's AUTH_DEV_FALLBACK=1 that sibling integration
// tests ride (env discipline, design §4.11 / C-04).
const PREV_FALLBACK = process.env.AUTH_DEV_FALLBACK;
const PREV_HOST = process.env.HOST;

async function get(path: string): Promise<Response> {
  return route(new Request(`${BASE}${path}`, { method: "GET" }));
}

function clearAuthEnv(): void {
  delete process.env.ONELOGIN_ISSUER;
  delete process.env.AUTH_DEV_FALLBACK;
  delete process.env.HOST;
}

function restoreAuthEnv(): void {
  delete process.env.ONELOGIN_ISSUER; // preload never sets this
  if (PREV_FALLBACK === undefined) delete process.env.AUTH_DEV_FALLBACK;
  else process.env.AUTH_DEV_FALLBACK = PREV_FALLBACK;
  if (PREV_HOST === undefined) delete process.env.HOST;
  else process.env.HOST = PREV_HOST;
}

describe("integration: auth-hardening fail-closed regressions (AC-10/11/12/14)", () => {
  beforeAll(clearAuthEnv);
  afterEach(clearAuthEnv);
  afterAll(restoreAuthEnv);

  // AC-10 — fail-closed default: issuer unset + opt-in absent → 401, no admin.
  test("AC-10: issuer unset + opt-in absent → 401, no devSession attached", async () => {
    // env already clean (no issuer, no opt-in).
    const res = await get(GUARDED_PATH);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  // AC-11 — dev escape hatch: issuer unset + opt-in set + loopback → dispatch.
  test("AC-11: issuer unset + AUTH_DEV_FALLBACK=1 + loopback → dev fallback dispatches", async () => {
    process.env.AUTH_DEV_FALLBACK = "1";
    process.env.HOST = "127.0.0.1";
    const res = await get(GUARDED_PATH);
    // Dispatched with the full-permission dev session → NOT 401/403.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  // AC-12 — non-loopback refusal (DEC-02): opt-in + non-loopback → the server
  // refuses. assertAuthPosture throwing IS the "server refuses" behavior (no
  // real server spawn needed); AC-12 also accepts a route()-level 401.
  test("AC-12: opt-in set + non-loopback host → assertAuthPosture throws (boot refusal)", () => {
    expect(() =>
      assertAuthPosture({
        host: "10.0.0.5",
        apiPort: 8787,
        neo4jUri: "bolt://x",
        neo4jUser: "neo4j",
        neo4jPassword: "x",
        postgresUri: "postgresql://x",
        anthropicApiKey: null,
        chatDbPath: "./x",
        analyticsDbPath: "./x",
        authDevFallback: true,
      }),
    ).toThrow(/AUTH_DEV_FALLBACK is set but HOST=10.0.0.5 is not loopback/);
  });

  test("AC-12: opt-in set + non-loopback host → route() yields 401 (never silent admit)", async () => {
    // No server booted here; devFallbackEligible() is false for a
    // non-loopback host, so the gate falls through to the fail-closed 401.
    process.env.AUTH_DEV_FALLBACK = "1";
    process.env.HOST = "10.0.0.5";
    const res = await get(GUARDED_PATH);
    expect(res.status).toBe(401);
  });

  // AC-14 — loud, non-latching: the fallback warns on EVERY request (latch
  // removed). Spy console.warn across two sequential requests.
  test("AC-14: dev fallback warns on EVERY request (warnedDevAuth latch retired)", async () => {
    process.env.AUTH_DEV_FALLBACK = "1";
    process.env.HOST = "127.0.0.1";

    const original = console.warn;
    const captured: string[] = [];
    console.warn = (...args: unknown[]) => {
      captured.push(args.join(" "));
    };
    try {
      await get(GUARDED_PATH);
      await get(GUARDED_PATH);
    } finally {
      console.warn = original;
    }

    const devWarnings = captured.filter((m) => m.includes("[auth] DEV-ONLY fallback ACTIVE"));
    // One per request → two across two requests (not a single latched warning).
    expect(devWarnings.length).toBe(2);
    // The message names the loopback-only constraint.
    expect(devWarnings[0]).toContain("NEVER expose beyond 127.0.0.1");
  });

  // Regression guard (post-review fix): the fail-closed auth decision MUST NOT
  // be coupled to unrelated env validation. devFallbackEligible() reads only
  // HOST / AUTH_DEV_FALLBACK from process.env — it must NEVER throw, even when
  // NEO4J_PASSWORD is unset (loadEnv() would throw on that). If it threw, the
  // gate's fail-closed 401 would surface as a 500 instead.
  test("devFallbackEligible does not throw when NEO4J_PASSWORD is unset (decoupled from loadEnv)", () => {
    const prevPw = process.env.NEO4J_PASSWORD;
    delete process.env.NEO4J_PASSWORD;
    try {
      // No opt-in, no loopback override → false, and crucially: no throw.
      expect(() => devFallbackEligible()).not.toThrow();
      expect(devFallbackEligible()).toBe(false);
      // Eligible combination still resolves without touching NEO4J_PASSWORD.
      process.env.AUTH_DEV_FALLBACK = "1";
      process.env.HOST = "127.0.0.1";
      expect(devFallbackEligible()).toBe(true);
    } finally {
      if (prevPw === undefined) delete process.env.NEO4J_PASSWORD;
      else process.env.NEO4J_PASSWORD = prevPw;
    }
  });
});
