// auth-hardening T-05 (AC-06 / FR-05) + T-09 (AC-13 / FR-10) — JWT
// verification pins. Uses a locally-minted RS256 keypair (jose
// generateKeyPair) + an injected createLocalJWKSet resolver (the FR-05 test
// seam), so signature verification runs with NO network egress (NFR-05).
//
// T-05 arms (issuer SET): good token verifies; bad-signature / wrong-issuer /
// wrong-audience / expired all reject.
// T-09 arms (issuer EMPTY): validateToken throws unless the dev opt-in is
// eligible (loopback + AUTH_DEV_FALLBACK), else returns the decoded payload.

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import type { KeyLike } from "jose";
import { OAuthClient } from "../src/auth/oauth";

const ISSUER = "https://issuer.test.invalid";
const AUDIENCE = "test-client";

const config = {
  clientId: AUDIENCE,
  clientSecret: "secret",
  issuer: ISSUER,
  redirectUri: "http://127.0.0.1:5173/auth/callback",
  scopes: ["openid", "profile", "email"],
};

let privateKey: KeyLike;
let jwks: ReturnType<typeof createLocalJWKSet>;
let otherPrivateKey: KeyLike; // a DIFFERENT key → bad signature

async function sign(
  key: KeyLike,
  claims: { issuer?: string; audience?: string; expired?: boolean } = {},
): Promise<string> {
  let jwt = new SignJWT({ name: "Test User", email: "test@test.invalid" })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("user-123")
    .setIssuer(claims.issuer ?? ISSUER)
    .setAudience(claims.audience ?? AUDIENCE);
  if (claims.expired) {
    jwt = jwt.setExpirationTime(Math.floor(Date.now() / 1000) - 3600); // 1h past
  } else {
    jwt = jwt.setExpirationTime("2h");
  }
  return jwt.sign(key);
}

describe("auth-hardening JWT verification, issuer set (AC-06 / FR-05)", () => {
  beforeAll(async () => {
    const kp = await generateKeyPair("RS256");
    privateKey = kp.privateKey;
    const publicJwk = await exportJWK(kp.publicKey);
    publicJwk.alg = "RS256";
    jwks = createLocalJWKSet({ keys: [publicJwk] });

    const other = await generateKeyPair("RS256");
    otherPrivateKey = other.privateKey;
  });

  function client(): OAuthClient {
    return new OAuthClient(config, jwks);
  }

  test("a valid RS256 token verifies", async () => {
    const token = await sign(privateKey);
    const info = await client().validateToken(token);
    expect(info.sub).toBe("user-123");
    expect(info.email).toBe("test@test.invalid");
  });

  test("a bad-signature token (signed by a different key) rejects", async () => {
    const token = await sign(otherPrivateKey);
    await expect(client().validateToken(token)).rejects.toThrow();
  });

  test("a wrong-issuer token rejects", async () => {
    const token = await sign(privateKey, { issuer: "https://evil.test.invalid" });
    await expect(client().validateToken(token)).rejects.toThrow();
  });

  test("a wrong-audience token rejects", async () => {
    const token = await sign(privateKey, { audience: "some-other-client" });
    await expect(client().validateToken(token)).rejects.toThrow();
  });

  test("an expired token rejects", async () => {
    const token = await sign(privateKey, { expired: true });
    await expect(client().validateToken(token)).rejects.toThrow();
  });
});

// T-09 (AC-13 / FR-10) — empty-issuer signature-bypass is fail-closed.
// These arms mutate AUTH_DEV_FALLBACK / HOST (which devFallbackEligible reads
// via loadEnv), so they are set per case and cleared in afterEach so nothing
// leaks into sibling files sharing the one bun-test process.
describe("auth-hardening empty-issuer fail-closed (AC-13 / FR-10)", () => {
  // A well-formed unsigned JWT (base64 header.payload.signature).
  const unsignedToken = `${btoa(JSON.stringify({ alg: "RS256" }))}.${btoa(
    JSON.stringify({ sub: "attacker-123", name: "Attacker", email: "evil@test.invalid" }),
  )}.fakesig`;

  function devClient(): OAuthClient {
    return new OAuthClient({ ...config, issuer: "" });
  }

  // Env discipline (design §4.11 / C-04): capture the pre-test values and
  // RESTORE them after each case, so this file never leaks its per-case
  // mutations into sibling files sharing the one bun-test process — in
  // particular it must NOT clobber the T-10 preload's AUTH_DEV_FALLBACK=1,
  // which the legacy auth-oauth empty-issuer decode tests rely on.
  const prevFallback = process.env.AUTH_DEV_FALLBACK;
  const prevHost = process.env.HOST;
  function restoreEnv(): void {
    if (prevFallback === undefined) delete process.env.AUTH_DEV_FALLBACK;
    else process.env.AUTH_DEV_FALLBACK = prevFallback;
    if (prevHost === undefined) delete process.env.HOST;
    else process.env.HOST = prevHost;
  }

  afterEach(restoreEnv);
  afterAll(restoreEnv);

  test("empty issuer + no dev opt-in → validateToken THROWS (no unverified decode)", async () => {
    delete process.env.AUTH_DEV_FALLBACK;
    delete process.env.HOST; // defaults to loopback, but opt-in absent
    await expect(devClient().validateToken(unsignedToken)).rejects.toThrow(
      /refusing to decode JWT without signature verification/,
    );
  });

  test("empty issuer + AUTH_DEV_FALLBACK=1 on loopback → returns the decoded payload (escape hatch)", async () => {
    process.env.AUTH_DEV_FALLBACK = "1";
    process.env.HOST = "127.0.0.1";
    const info = await devClient().validateToken(unsignedToken);
    expect(info.sub).toBe("attacker-123");
  });
});
