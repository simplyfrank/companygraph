// Permission cache invalidation
// Invalidates user sessions when persona or RBAC role changes occur

import { getSessionStorage } from "./redis-session";

/**
 * Invalidate all sessions for a specific user
 * Call this when a user's persona assignments or RBAC roles change
 */
export async function invalidateUserSessions(userId: string): Promise<void> {
  try {
    const storage = getSessionStorage();
    await storage.deleteByUserId(userId);
  } catch (error) {
    console.error("Error invalidating user sessions:", error);
  }
}

/**
 * Invalidate all sessions for users assigned to a specific persona
 * Call this when a persona's RBAC roles change
 */
export async function invalidatePersonaSessions(personaId: string): Promise<void> {
  try {
    const storage = getSessionStorage();
    // This would require querying the session storage to find sessions with this persona
    // For now, we'll delete all sessions as a fallback
    // TODO: Implement more granular invalidation based on session content
    await storage.deleteAll();
  } catch (error) {
    console.error("Error invalidating persona sessions:", error);
  }
}

/**
 * Invalidate all sessions when RBAC roles change
 * Call this when RBAC role permissions are modified
 */
export async function invalidateAllSessions(): Promise<void> {
  try {
    const storage = getSessionStorage();
    await storage.deleteAll();
  } catch (error) {
    console.error("Error invalidating all sessions:", error);
  }
}

/**
 * Check if a session needs refresh based on persona/RBAC changes
 * This can be called on session access to check if permissions need to be re-resolved
 */
export async function shouldRefreshSession(sessionId: string, lastPersonaChange: Date, lastRbacChange: Date): Promise<boolean> {
  try {
    const storage = getSessionStorage();
    const session = await storage.get(sessionId);
    if (!session) return false;

    // Check if session was created before the last persona or RBAC change
    const sessionCreatedAt = session.expiresAt - (8 * 60 * 60 * 1000); // Approximate creation time
    return sessionCreatedAt < lastPersonaChange.getTime() || sessionCreatedAt < lastRbacChange.getTime();
  } catch (error) {
    console.error("Error checking session refresh:", error);
    return false;
  }
}
