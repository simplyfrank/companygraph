// OAuth2/OIDC authentication for OneLogin SSO integration

import { jwtVerify, createRemoteJWKSet } from "jose";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  issuer: string;
  redirectUri: string;
  scopes: string[];
}

export interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface UserInfo {
  sub: string;
  name: string;
  email: string;
  preferred_username?: string;
  groups?: string[];
}

export interface UserSession {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  storeAccess: string[]; // Store IDs this user can access
  personaAssignments: Array<{ personaId: string; personaName: string; domainIds: string[] }>;
  rbacRoles: string[]; // Resolved RBAC roles from personas
  permissions: string[]; // Resolved permissions from RBAC roles
  expiresAt: number;
}

export class OAuthClient {
  constructor(private config: OAuthConfig) {}

  getAuthorizationUrl(state: string): string {
    const params = new (globalThis as any).URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(" "),
      state: state,
    });

    const issuerUrl = new (globalThis as any).URL(this.config.issuer);
    const authUrl = `${issuerUrl.protocol}//${issuerUrl.host}/auth`;
    return `${authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    const tokenUrl = `${this.config.issuer}/token`;
    const response = await (globalThis as any).fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new (globalThis as any).URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const userInfoUrl = `${this.config.issuer}/userinfo`;
    const response = await (globalThis as any).fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }

    return response.json();
  }

  async validateToken(idToken: string): Promise<UserInfo> {
    // When no issuer is configured (dev mode), decode without verification.
    if (!this.config.issuer) {
      console.warn("[oauth] No issuer configured — token signature not verified");
      return this.decodeToken(idToken);
    }

    // Verify JWT signature using the issuer's JWKS endpoint.
    const jwks = this.getJwks();
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: this.config.issuer,
      audience: this.config.clientId,
    });
    return {
      sub: payload.sub!,
      name: payload.name as string,
      email: payload.email as string,
      preferred_username: payload.preferred_username as string,
      groups: payload.groups as string[],
    };
  }

  private decodeToken(idToken: string): UserInfo {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid token format");
    }
    const base64 = parts[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!base64) throw new Error("Invalid token payload");
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
    const decoded = (globalThis as any).atob(padded);
    const payload = JSON.parse(decoded);
    return {
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      preferred_username: payload.preferred_username,
      groups: payload.groups,
    };
  }

  private _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  private getJwks(): ReturnType<typeof createRemoteJWKSet> {
    if (!this._jwks) {
      const jwksUrl = new URL(`${this.config.issuer}/.well-known/jwks.json`);
      this._jwks = createRemoteJWKSet(jwksUrl);
    }
    return this._jwks;
  }
}

// Session management (in-memory for now, use Redis in production)
const sessions = new Map<string, UserSession>();

export async function createSession(userInfo: UserInfo, roles: string[], storeAccess: string[], personaAssignments: Array<{ personaId: string; personaName: string; domainIds: string[] }>, rbacRoles: string[], permissions: string[]): Promise<string> {
  const sessionId = generateSessionId();
  const session: UserSession = {
    userId: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name,
    roles,
    storeAccess,
    personaAssignments,
    rbacRoles,
    permissions,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
  };

  // Try to use Redis session storage if available
  try {
    const { getSessionStorage } = require("./redis-session");
    const storage = getSessionStorage();
    await storage.set(sessionId, session, 28800); // 8 hours in seconds
  } catch {
    // Fallback to in-memory storage
    sessions.set(sessionId, session);
  }

  return sessionId;
}

export async function getSession(sessionId: string): Promise<UserSession | null> {
  // Try to get from Redis session storage first
  try {
    const { getSessionStorage } = require("./redis-session");
    const storage = getSessionStorage();
    const session = await storage.get(sessionId);
    if (session) return session;
  } catch {
    // Fallback to in-memory storage
  }

  // In-memory fallback
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  // Try to delete from Redis session storage
  try {
    const { getSessionStorage } = require("./redis-session");
    const storage = getSessionStorage();
    await storage.delete(sessionId);
  } catch {
    // Fallback to in-memory storage
  }

  // In-memory fallback
  sessions.delete(sessionId);
}

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// Role definitions for RBAC
export const ROLES = {
  ADMIN: "admin",
  STORE_MANAGER: "store_manager",
  FULFILLMENT_OPS: "fulfillment_ops",
  ANALYST: "analyst",
  VIEWER: "viewer",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Role permissions
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  [ROLES.ADMIN]: ["*"], // Full access
  [ROLES.STORE_MANAGER]: [
    "read:own_store",
    "write:own_store",
    "read:journeys",
    "read:analytics",
  ],
  [ROLES.FULFILLMENT_OPS]: [
    "read:fulfillment",
    "write:fulfillment",
    "read:inventory",
    "write:inventory",
  ],
  [ROLES.ANALYST]: [
    "read:*",
    "read:analytics",
    "read:reports",
  ],
  [ROLES.VIEWER]: [
    "read:own_store",
    "read:journeys",
  ],
};

export function hasPermission(userRoles: Role[], permission: string): boolean {
  return userRoles.some(role => {
    const permissions = ROLE_PERMISSIONS[role];
    return permissions.some(p => {
      if (p === "*") return true;
      if (p.endsWith("*")) {
        const prefix = p.slice(0, -1);
        return permission.startsWith(prefix);
      }
      return p === permission;
    });
  });
}

/**
 * New permission check using resolved permissions from RBAC roles
 * This uses the permissions array from the session (resolved from personas)
 */
export function hasPermissionByRbac(userPermissions: string[], permission: string): boolean {
  // Check for wildcard permission
  if (userPermissions.includes("*")) {
    return true;
  }

  // Check for exact match
  if (userPermissions.includes(permission)) {
    return true;
  }

  // Check for prefix match (e.g., "journey:*" matches "journey:read")
  const requiredParts = permission.split(":");
  for (const perm of userPermissions) {
    const permParts = perm.split(":");
    if (permParts.length === 2 && permParts[1] === "*") {
      if (requiredParts[0] === permParts[0]) {
        return true;
      }
    }
  }

  return false;
}

export function hasStoreAccess(userStoreAccess: string[], storeId: string): boolean {
  return userStoreAccess.includes("*") || userStoreAccess.includes(storeId);
}

// Middleware factory for protecting routes
export function withAuth(handler: (req: any) => Promise<Response>) {
  return async (req: any): Promise<Response> => {
    const sessionId = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
    
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    
    const session = await getSession(sessionId);
    
    if (!session) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    
    // Attach user context to request
    req.user = {
      id: session.userId,
      email: session.email,
      name: session.name,
      roles: session.roles,
      storeAccess: session.storeAccess,
    };
    
    return handler(req);
  };
}

export function withPermission(permission: string) {
  return (handler: (req: any) => Promise<Response>) => {
    return async (req: any): Promise<Response> => {
      if (!req.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      
      // Use RBAC-based permission check if available, fall back to role-based
      const userPermissions = req.user.permissions || [];
      if (userPermissions.length > 0) {
        if (!hasPermissionByRbac(userPermissions, permission)) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
      } else {
        // Fall back to legacy role-based check
        if (!hasPermission(req.user.roles, permission)) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
      }
      
      return handler(req);
    };
  };
}

export function withStoreAccess(storeIdParam: string = "storeId") {
  return (handler: (req: any) => Promise<Response>) => {
    return async (req: any): Promise<Response> => {
      if (!req.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      
      // Extract store ID from request (query param, path param, or body)
      const url = new (globalThis as any).URL(req.url);
      const storeId = url.searchParams.get(storeIdParam) || req.params?.[storeIdParam];
      
      if (storeId) {
        // Check legacy store access
        if (!hasStoreAccess(req.user.storeAccess, storeId)) {
          // Check persona-based domain access
          const personaAssignments = req.user.personaAssignments || [];
          const hasDomainAccess = personaAssignments.some((assignment: any) => {
            return assignment.domainIds.includes("*") || assignment.domainIds.includes(storeId);
          });
          
          if (!hasDomainAccess) {
            return new Response(JSON.stringify({ error: "Forbidden: No access to this store/domain" }), {
              status: 403,
              headers: { "content-type": "application/json" },
            });
          }
        }
      }
      
      return handler(req);
    };
  };
}
