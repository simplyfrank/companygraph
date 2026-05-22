# Pattern: If-Match optimistic concurrency

Use this when a REST handler updates a row that someone else might have just edited in another tab. The standard cure: the client sends the row's last `updated_at` as the `If-Match` request header; the server compares; if they disagree, it returns 412 Precondition Failed and the client refetches.

This is the pattern shipped with `trip-companion-management` T-23 (`telegram/src/webapp/middleware/if-match.ts`).

## When to use

- A PATCH or DELETE handler where two writers landing back-to-back would clobber each other silently.
- A status-mutation endpoint where dropping the header altogether is a sign the caller never read the current state (use `{required: true}` so missing header → 428).

## When NOT to use

- POST creates (no prior version to compare against).
- Append-only writes (status log, audit trail).
- Reads.

## API surface

```ts
import { parseIfMatch, assertIfMatch, IfMatchError } from "../middleware/if-match";

// Optional check (header may be absent):
try {
  assertIfMatch(req, currentRow.updated_at);
} catch (e) {
  if (e instanceof IfMatchError) return corsResponse(e.body, { status: e.status });
  throw e;
}

// Required check (header MUST be present, missing → 428):
assertIfMatch(req, currentRow.updated_at, { required: true });
```

`parseIfMatch` strips RFC 7232 quotes (`"abc"` and `abc` are equivalent). Both helpers operate on the raw `Request` — no body parsing.

## Status codes

| Condition                              | Status | Body                                       |
|---------------------------------------- |--------|--------------------------------------------|
| Header present, matches                 | (none) | proceeds                                   |
| Header absent, `required: false`        | (none) | proceeds                                   |
| Header absent, `required: true`         | 428    | `{error: "precondition_required", hint}`   |
| Header present, doesn't match           | 412    | `{error: "precondition_failed", current_value}` |

The `current_value` field on 412 helps clients reconcile — they refetch and merge.

## Anti-patterns

- **Comparing raw headers inline.** Easy to forget the RFC 7232 quote-strip. Use `parseIfMatch`.
- **Re-implementing the 412/428 dance per route.** Centralized helper means one place to change the error shape.
- **Returning 409 instead of 412.** 409 is for semantic conflicts (e.g. "you can't delete the last owner"). 412 is specifically for stale-precondition failures.
- **Demanding `If-Match` on creates.** There is no prior version. Use server-side dedupe (idempotency_key) instead.

## Tests

- `telegram/src/webapp/middleware/__tests__/if-match.test.ts` covers all four branches.
- Route-level tests should exercise the "stale precondition" path with a real handler — see `trip-traveler-concurrency.test.ts`.
