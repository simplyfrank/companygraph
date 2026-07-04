// Structured JSON-line request logger (FR-13). Enhanced for production with
// correlation IDs, log levels, and user context for Loki integration.

export interface RequestLogEntry {
  ts: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  method: string;
  path: string;
  status: number;
  durationMs: number;
  cypherDurationMs?: number;
  err?: string;
  correlationId?: string;
  userId?: string;
  userRole?: string;
  storeId?: string;
  userAgent?: string;
  clientIp?: string;
}

export function logRequest(entry: RequestLogEntry): void {
  // eslint-disable-next-line no-console
  (globalThis as any).console.log(JSON.stringify(entry));
}

// Helper to generate correlation ID
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
