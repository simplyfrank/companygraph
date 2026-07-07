// auth-hardening (FR-09, FR-10, DEC-01, DEC-02, DEC-05) — the single,
// small, self-contained home for the security-critical dev-fallback
// decision. The DEV-ONLY full-permission fallback and the unverified-JWT
// decode are BOTH gated by `devFallbackEligible()` below. Keep this module
// tiny and obviously-correct: it is the one place that decides whether the
// unauthenticated escape hatch may open.
//
// Fail-closed contract:
//   - Default (no opt-in) → NOT eligible → gate returns 401, validateToken
//     throws. No synthetic admin session is ever attached.
//   - Eligible ONLY when ALL hold: (a) AUTH_DEV_FALLBACK opt-in set, AND
//     (b) bind host is loopback, AND (c) no ONELOGIN_ISSUER configured.
//   - Opt-in set on a NON-loopback host → misconfiguration → boot refusal
//     (assertAuthPosture throws; server exits without binding).

import { loadEnv } from "../env";
import type { Env } from "../env";
import { isRealBacking } from "./redis-session";

/** Loopback bind hosts the dev fallback is permitted on. */
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

/**
 * The dev full-permission fallback is eligible ONLY when all hold:
 *   (a) the AUTH_DEV_FALLBACK opt-in is set (env.authDevFallback), AND
 *   (b) the bind host is loopback, AND
 *   (c) no ONELOGIN_ISSUER is configured.
 * Any other combination → NOT eligible → the gate / validateToken fail closed.
 *
 * `env` and `issuer` default to live values but are injectable so unit tests
 * stay hermetic (no process.env mutation required).
 */
export function devFallbackEligible(
  env: Env = loadEnv(),
  issuer: string | undefined = process.env.ONELOGIN_ISSUER,
): boolean {
  return env.authDevFallback && isLoopbackHost(env.host) && !issuer;
}

/**
 * DEC-05 — a non-loopback deployment MUST have a real (non-in-memory)
 * session backing, else sessions vaporize across processes / restarts.
 * Keys on HOST ALONE, not on issuer (design C-02): a loopback OneLogin
 * smoke-test must still boot — the single-process loopback in-memory Map is
 * a correct backing there regardless of issuer.
 */
export function assertSessionBacking(env: Env = loadEnv()): void {
  if (!isLoopbackHost(env.host) && !isRealBacking()) {
    throw new Error(
      `[auth] HOST=${env.host} is not loopback but session storage is the ` +
        `in-memory stub. A deployed (multi-process / restart-surviving) instance ` +
        `needs a real session backing before it can boot. Bind to 127.0.0.1 for ` +
        `local dev, or wire a real session store.`,
    );
  }
}

/**
 * Boot-time auth posture assertion (DEC-02, DEC-05). Called from
 * server.ts main() immediately after loadEnv() and BEFORE Bun.serve, so a
 * misconfiguration crashes loudly at boot without ever binding the port.
 */
export function assertAuthPosture(env: Env = loadEnv()): void {
  // DEC-02 — opt-in on a non-loopback host is a misconfiguration; crash loudly
  // rather than silently degrading to a per-request 401 (which looks like
  // "auth works" and hides the mistake).
  if (env.authDevFallback && !isLoopbackHost(env.host)) {
    throw new Error(
      `[auth] AUTH_DEV_FALLBACK is set but HOST=${env.host} is not loopback. ` +
        `The full-permission dev fallback is loopback-only. Set ONELOGIN_ISSUER ` +
        `for a deployed instance, or bind to 127.0.0.1 for local dev.`,
    );
  }
  // DEC-05 — refuse a non-loopback deploy still on the in-memory stub.
  assertSessionBacking(env);
}
