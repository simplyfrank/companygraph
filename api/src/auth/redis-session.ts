// Redis-based session storage for production
// Replaces in-memory session storage with Redis for scalability

import type { UserSession } from "./oauth";

// Redis client interface - this should be implemented with your Redis client
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<"OK" | null>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

// In-memory fallback for development/testing
class InMemorySessionStorage {
  private sessions = new Map<string, UserSession>();

  async get(key: string): Promise<string | null> {
    const session = this.sessions.get(key);
    if (!session) return null;
    
    // Check expiration
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(key);
      return null;
    }
    
    return JSON.stringify(session);
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<"OK" | null> {
    const session: UserSession = JSON.parse(value);
    this.sessions.set(key, session);
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.sessions.delete(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    if (pattern === "*") {
      return Array.from(this.sessions.keys());
    }
    // Simple pattern matching for development
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    return Array.from(this.sessions.keys()).filter((key) => regex.test(key));
  }
}

// Session storage abstraction
export class SessionStorage {
  private client: RedisClient;
  private prefix: string;

  constructor(client?: RedisClient, prefix: string = "session:") {
    this.client = client || new InMemorySessionStorage();
    this.prefix = prefix;
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  async get(sessionId: string): Promise<UserSession | null> {
    const key = this.key(sessionId);
    const value = await this.client.get(key);
    if (!value) return null;

    try {
      const session: UserSession = JSON.parse(value);
      
      // Check expiration
      if (Date.now() > session.expiresAt) {
        await this.delete(sessionId);
        return null;
      }
      
      return session;
    } catch (error) {
      console.error("Error parsing session:", error);
      return null;
    }
  }

  async set(sessionId: string, session: UserSession, ttlSeconds: number = 28800): Promise<void> {
    const key = this.key(sessionId);
    const value = JSON.stringify(session);
    await this.client.set(key, value, { EX: ttlSeconds });
  }

  async delete(sessionId: string): Promise<void> {
    const key = this.key(sessionId);
    await this.client.del(key);
  }

  async deleteAll(): Promise<void> {
    const keys = await this.client.keys(`${this.prefix}*`);
    for (const key of keys) {
      await this.client.del(key);
    }
  }

  async deleteByUserId(userId: string): Promise<void> {
    const keys = await this.client.keys(`${this.prefix}*`);
    for (const key of keys) {
      const value = await this.client.get(key);
      if (value) {
        try {
          const session: UserSession = JSON.parse(value);
          if (session.userId === userId) {
            await this.client.del(key);
          }
        } catch (error) {
          // Ignore parse errors
        }
      }
    }
  }
}

// Default session storage instance (in-memory for now)
let defaultSessionStorage: SessionStorage | null = null;

export function getSessionStorage(): SessionStorage {
  if (!defaultSessionStorage) {
    // TODO: Initialize Redis client here when Redis is available
    // const redisClient = createRedisClient();
    // defaultSessionStorage = new SessionStorage(redisClient);
    
    // Fallback to in-memory for development
    defaultSessionStorage = new SessionStorage();
  }
  return defaultSessionStorage;
}

export function setSessionStorage(storage: SessionStorage): void {
  defaultSessionStorage = storage;
}

// auth-hardening (FR-11 / DEC-05) — reports whether a REAL (non-in-memory)
// session backing is wired. The Redis client TODO above is unimplemented, so
// getSessionStorage() always returns the in-memory stub; this returns false
// until that changes. assertSessionBacking() (dev-fallback.ts) reads it to
// refuse a non-loopback deploy that would silently lose sessions.
export function isRealBacking(): boolean {
  return false;
}
