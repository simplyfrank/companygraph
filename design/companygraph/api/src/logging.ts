// Structured JSON-line request logger (FR-13). Single function, one line
// per request to stdout — no log levels, no rotation. Designed to be
// piped into whatever the operator wants (jq, journalctl, etc.).

export interface RequestLogEntry {
  ts: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  cypherDurationMs?: number;
  err?: string;
}

export function logRequest(entry: RequestLogEntry): void {
  console.log(JSON.stringify(entry));
}
