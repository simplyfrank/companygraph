// Authentication routes for OneLogin SSO integration

import { ok } from "./_helpers";
import { OAuthClient, createSession, getSession, ROLES, hasPermission, hasStoreAccess } from "../auth/oauth";
import { resolveUserPermissions } from "../auth/permission-resolver";
import { getSessionStorage } from "../auth/redis-session";

// OAuth configuration from environment
const oauthConfig = {
  clientId: (globalThis as any).process?.env?.ONELOGIN_CLIENT_ID || "",
  clientSecret: (globalThis as any).process?.env?.ONELOGIN_CLIENT_SECRET || "",
  issuer: (globalThis as any).process?.env?.ONELOGIN_ISSUER || "",
  redirectUri: (globalThis as any).process?.env?.ONELOGIN_REDIRECT_URI || "http://localhost:5173/auth/callback",
  scopes: ["openid", "profile", "email", "groups"],
};

const oauthClient = new OAuthClient(oauthConfig);

export async function handleAuthLogin(): Promise<Response> {
  const state = Math.random().toString(36).substring(2, 15);
  const authUrl = oauthClient.getAuthorizationUrl(state);
  
  // In production, store state in Redis with expiration
  return ok({ authUrl, state });
}

export async function handleAuthCallback(req: any): Promise<Response> {
  const url = new (globalThis as any).URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    return ok({ success: false, error: "Missing authorization code" }, 400);
  }

  try {
    // Exchange code for tokens
    const tokens = await oauthClient.exchangeCodeForToken(code);
    
    // Get user info
    const userInfo = await oauthClient.getUserInfo(tokens.access_token);
    
    // Map OneLogin groups to roles
    const roles = mapGroupsToRoles(userInfo.groups || []);
    
    // Map user to store access (in production, query user-store mapping from database)
    const storeAccess = mapUserToStores(userInfo.sub, roles);
    
    // Resolve persona assignments and RBAC permissions
    const resolvedPermissions = await resolveUserPermissions(userInfo.sub);
    
    // Create session with persona assignments and RBAC roles
    const sessionId = await createSession(
      userInfo,
      roles,
      storeAccess,
      resolvedPermissions.personaAssignments,
      resolvedPermissions.rbacRoles,
      resolvedPermissions.permissions
    );
    
    // Set session cookie
    const response = ok({
      success: true,
      user: {
        id: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        roles,
        storeAccess,
        personaAssignments: resolvedPermissions.personaAssignments,
        rbacRoles: resolvedPermissions.rbacRoles,
        permissions: resolvedPermissions.permissions,
      },
    });
    
    response.headers.set("Set-Cookie", `session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
    
    return response;
  } catch (e) {
    return ok({ success: false, error: "Authentication failed" }, 500);
  }
}

export async function handleAuthLogout(): Promise<Response> {
  const response = ok({ success: true });
  response.headers.set("Set-Cookie", "session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
  return response;
}

export async function handleAuthMe(req: any): Promise<Response> {
  const sessionId = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
  
  if (!sessionId) {
    return ok({ error: "No session" }, 401);
  }
  
  const session = await getSession(sessionId);
  
  if (!session) {
    return ok({ error: "Invalid or expired session" }, 401);
  }
  
  return ok({
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      roles: session.roles,
      storeAccess: session.storeAccess,
    },
  });
}

// Middleware to check authentication
export async function requireAuth(req: any): Promise<{ session: any; user: any } | null> {
  const sessionId = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
  
  if (!sessionId) {
    return null;
  }
  
  const session = await getSession(sessionId);
  
  if (!session) {
    return null;
  }
  
  return {
    session,
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      roles: session.roles,
      storeAccess: session.storeAccess,
    },
  };
}

// Middleware to check permissions
export function requirePermission(permission: string) {
  return async (req: any) => {
    const auth = await requireAuth(req);
    if (!auth) {
      return false;
    }
    
    return hasPermission(auth.user.roles as any[], permission);
  };
}

// Middleware to check store access
export function requireStoreAccess(storeId: string) {
  return async (req: any) => {
    const auth = await requireAuth(req);
    if (!auth) {
      return false;
    }
    
    return hasStoreAccess(auth.user.storeAccess, storeId);
  };
}

// Helper functions
function mapGroupsToRoles(groups: string[]): string[] {
  const roles: string[] = [];
  
  if (groups.includes("admin")) {
    roles.push(ROLES.ADMIN);
  }
  if (groups.includes("store-managers")) {
    roles.push(ROLES.STORE_MANAGER);
  }
  if (groups.includes("fulfillment-ops")) {
    roles.push(ROLES.FULFILLMENT_OPS);
  }
  if (groups.includes("analysts")) {
    roles.push(ROLES.ANALYST);
  }
  
  // Default to viewer if no specific roles
  if (roles.length === 0) {
    roles.push(ROLES.VIEWER);
  }
  
  return roles;
}

function mapUserToStores(userId: string, roles: string[]): string[] {
  // In production, query user-store mapping from database
  // For now, return wildcard for admins, empty for others
  if (roles.includes(ROLES.ADMIN)) {
    return ["*"];
  }
  
  // TODO: Implement user-store mapping from database
  return [];
}
