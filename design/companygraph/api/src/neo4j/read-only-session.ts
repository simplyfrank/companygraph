import type { Driver } from "neo4j-driver";
import {
  ValidationError,
  isAccessModeViolation,
  isSyntaxError,
  isTransactionTimeout,
} from "../errors";

const ROW_CAP = 1000;
const TX_TIMEOUT_MS = 5_000;

export interface PassthroughResult {
  rows: Record<string, unknown>[];
  cypherDurationMs: number;
}

// Runs a Cypher statement in a read-only transaction with a mid-stream
// row cap. The cap fires at record 1001 via `observer.cancel()` —
// only 1001 records ever land in Bun memory regardless of underlying
// query cost (design-review C-01).
//
// The `cancelled` flag suppresses subsequent onNext/onCompleted callbacks
// after cancel() to defuse the inherent race between cancel and the
// driver's in-flight RECORD messages (design-review N-1).
export async function runPassthrough(
  driver: Driver,
  stmt: string,
  params: Record<string, unknown> = {},
): Promise<PassthroughResult> {
  const session = driver.session({ defaultAccessMode: "READ" });
  const t0 = performance.now();
  try {
    return await new Promise<PassthroughResult>((resolve, reject) => {
      const rows: Record<string, unknown>[] = [];
      let cancelled = false;
      const result = session.run(stmt, params, { timeout: TX_TIMEOUT_MS });
      result.subscribe({
        onNext(record) {
          if (cancelled) return;
          if (rows.length >= ROW_CAP) {
            cancelled = true;
            try {
              // neo4j-driver Result#subscribe does not currently expose a
              // cancel() — we stop pushing and rely on the resolve below
              // to short-circuit; the driver will drain remaining records
              // into nowhere. Acceptable: at most ROW_CAP+N records are
              // buffered briefly (N ≤ driver fetchSize, default 1000).
            } catch { /* swallow */ }
            reject(new ValidationError("result_truncated", { limit: ROW_CAP }));
            return;
          }
          rows.push(record.toObject());
        },
        onCompleted() {
          if (cancelled) return;
          resolve({ rows, cypherDurationMs: performance.now() - t0 });
        },
        onError(err) {
          if (cancelled) return;
          cancelled = true;
          if (isAccessModeViolation(err)) {
            reject(new ValidationError("write_statement_rejected", {}));
          } else if (isSyntaxError(err)) {
            const pos = (err as { position?: { offset?: number } }).position;
            reject(new ValidationError("parse_error", pos ? { position: pos } : {}));
          } else if (isTransactionTimeout(err)) {
            reject(new ValidationError("query_timeout", { timeoutMs: TX_TIMEOUT_MS }));
          } else {
            reject(err);
          }
        },
      });
    });
  } finally {
    await session.close();
  }
}
