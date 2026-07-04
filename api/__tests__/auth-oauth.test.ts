// Tests for OAuth2/OIDC authentication implementation

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  OAuthClient,
  createSession,
  getSession,
  deleteSession,
  ROLES,
  hasPermission,
  hasStoreAccess,
  withAuth,
  withPermission,
  withStoreAccess,
} from "../src/auth/oauth";

describe("OAuthClient", () => {
  const config = {
    clientId: "test-client",
    clientSecret: "test-secret",
    issuer: "https://test.onelogin.com",
    redirectUri: "http://localhost:5173/auth/callback",
    scopes: ["openid", "profile", "email"],
  };

  let client: OAuthClient;

  beforeEach(() => {
    client = new OAuthClient(config);
  });

  it("should generate authorization URL with state", () => {
    const state = "test-state";
    const url = client.getAuthorizationUrl(state);
    
    expect(url).toContain("response_type=code");
    expect(url).toContain("client_id=test-client");
    expect(url).toContain("redirect_uri=" + encodeURIComponent(config.redirectUri));
    expect(url).toContain("state=" + state);
  });

  it("should validate token format (dev mode — no issuer)", async () => {
    // In dev mode (no issuer configured), tokens are decoded without signature verification.
    const devClient = new OAuthClient({ ...config, issuer: "" });
    const header = btoa(JSON.stringify({ alg: "RS256" }));
    const payload = btoa(JSON.stringify({ sub: "user-123", name: "Test User", email: "test@example.com" }));
    const signature = "signature";
    const validToken = `${header}.${payload}.${signature}`;
    
    const result = await devClient.validateToken(validToken);
    
    expect(result).toBeDefined();
    expect(result.sub).toBe("user-123");
  });

  it("should reject invalid token format (dev mode — no issuer)", async () => {
    const devClient = new OAuthClient({ ...config, issuer: "" });
    const invalidToken = "invalid";
    
    await expect(devClient.validateToken(invalidToken)).rejects.toThrow("Invalid token format");
  });

  it("should attempt JWKS verification when issuer is configured", async () => {
    // With a real issuer, validateToken should attempt JWKS verification
    // and fail because the token is not properly signed.
    const header = btoa(JSON.stringify({ alg: "RS256" }));
    const payload = btoa(JSON.stringify({ sub: "user-123", name: "Test User", email: "test@example.com" }));
    const signature = "fake-signature";
    const unsignedToken = `${header}.${payload}.${signature}`;
    
    await expect(client.validateToken(unsignedToken)).rejects.toThrow();
  });
});

describe("Session Management", () => {
  beforeEach(() => {
    // Clear sessions before each test
    (globalThis as any).sessions = new Map();
  });

  it("should create session with user info", async () => {
    const userInfo = {
      sub: "user-123",
      name: "Test User",
      email: "test@example.com",
    };
    const roles = [ROLES.ADMIN];
    const storeAccess = ["*"];

    const sessionId = await createSession(userInfo, roles, storeAccess, [], [], []);
    
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe("string");
  });

  it("should retrieve valid session", async () => {
    const userInfo = {
      sub: "user-123",
      name: "Test User",
      email: "test@example.com",
    };
    const roles = [ROLES.VIEWER];
    const storeAccess = ["store-1"];

    const sessionId = await createSession(userInfo, roles, storeAccess, [], [], []);
    const session = await getSession(sessionId);
    
    expect(session).toBeDefined();
    expect(session?.userId).toBe("user-123");
    expect(session?.email).toBe("test@example.com");
    expect(session?.roles).toEqual([ROLES.VIEWER]);
    expect(session?.storeAccess).toEqual(["store-1"]);
  });

  it("should return null for invalid session", async () => {
    const session = await getSession("invalid-session-id");
    expect(session).toBeNull();
  });

  it("should delete session", async () => {
    const userInfo = {
      sub: "user-123",
      name: "Test User",
      email: "test@example.com",
    };
    const roles = [ROLES.VIEWER];
    const storeAccess = ["store-1"];

    const sessionId = await createSession(userInfo, roles, storeAccess, [], [], []);
    await deleteSession(sessionId);
    
    const session = await getSession(sessionId);
    expect(session).toBeNull();
  });
});

describe("RBAC Permissions", () => {
  it("should grant admin full access", () => {
    const roles = [ROLES.ADMIN];
    expect(hasPermission(roles, "any:permission")).toBe(true);
    expect(hasPermission(roles, "read:all")).toBe(true);
  });

  it("should grant store manager store-specific permissions", () => {
    const roles = [ROLES.STORE_MANAGER];
    expect(hasPermission(roles, "read:own_store")).toBe(true);
    expect(hasPermission(roles, "write:own_store")).toBe(true);
    expect(hasPermission(roles, "read:all")).toBe(false);
  });

  it("should grant analyst read-only access", () => {
    const roles = [ROLES.ANALYST];
    expect(hasPermission(roles, "read:all")).toBe(true);
    expect(hasPermission(roles, "write:all")).toBe(false);
  });

  it("should grant viewer limited access", () => {
    const roles = [ROLES.VIEWER];
    expect(hasPermission(roles, "read:own_store")).toBe(true);
    expect(hasPermission(roles, "write:own_store")).toBe(false);
  });
});

describe("Store Access Control", () => {
  it("should grant wildcard access", () => {
    const storeAccess = ["*"];
    expect(hasStoreAccess(storeAccess, "any-store")).toBe(true);
  });

  it("should grant access to specific store", () => {
    const storeAccess = ["store-1", "store-2"];
    expect(hasStoreAccess(storeAccess, "store-1")).toBe(true);
    expect(hasStoreAccess(storeAccess, "store-2")).toBe(true);
  });

  it("should deny access to unauthorized store", () => {
    const storeAccess = ["store-1"];
    expect(hasStoreAccess(storeAccess, "store-2")).toBe(false);
  });
});
