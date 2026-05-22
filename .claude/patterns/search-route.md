# Search route

**When to use:** New `/api/<domain>/search` (or similar read-only lookup) endpoint that fits the shape *validate inputs → optional precheck → adapter → JSON response*.
**Canonical example:** `telegram/src/webapp/routes/flights.ts` (three configs: `flightSearchRoute`, `flightAirportsRoute`, `flightLookupRoute`)
**Tests:** `telegram/src/webapp/search/__tests__/handler.test.ts`
**Related:** [registry.md](registry.md) (shortcuts-key path allowlist), [test-harness.md](test-harness.md)

## Shape

A search route is expressed as a declarative `SearchRouteConfig` and wrapped by the `createSearchRoute` factory at `telegram/src/webapp/search/handler.ts`. The factory returns a `RouteHandler` that plugs directly into the route file.

```ts
import { createSearchRoute, ShortCircuit, requireMinLength } from "../search";

const myRoute = createSearchRoute<Input, Output>({
  path: "/api/mydomain/search",
  method: "GET", // or "POST"

  // Parse + validate. Return { kind: "validated", input } OR
  // { kind: "short_circuit", status, body } for lenient paths.
  // You can also throw ShortCircuit(status, body) from anywhere inside.
  validate: ({ url, req }) => {
    const q = (url.searchParams.get("q") || "").trim();
    requireMinLength(q, 2, { results: [] }); // 200 + empty body on short query
    return { kind: "validated", input: { q } };
  },

  // Optional gate: quota, availability, required config.
  // allow:false → respond with status (default 503) + body; skip adapter.
  precheck: async () => {
    const { isQuotaExhausted } = await import("../../cloud/integrations/amadeus/quota");
    return isQuotaExhausted("amadeus_flights")
      ? { allow: false, status: 429, body: { error: "quota reached", quotaExhausted: true } }
      : { allow: true };
  },

  // The search itself. Lazy-import the adapter so heavy deps load on first call.
  adapter: async ({ q }) => {
    const { searchMyDomain } = await import("../../cloud/integrations/mydomain");
    return { results: await searchMyDomain(q) };
  },

  // Error → status mapping. First match wins; fall-through uses defaultErrorStatus.
  errorStatus: (err) => (err instanceof MyApiError ? 502 : undefined),
  defaultErrorStatus: 500, // flights/search uses 503
});

// In the route file, invoke before any matching inline handlers:
export async function handleMydomainRoutes(deps: RouteDeps): Promise<Response | null> {
  const searchResp = await myRoute(deps);
  if (searchResp) return searchResp;
  // ... other endpoints ...
}
```

## Required (acceptance checklist)

- [ ] Config declared at module scope (not inside the handler function) so it's reused per request, not rebuilt.
- [ ] `path` and `method` match exactly — `createSearchRoute` is strict, no prefix matching.
- [ ] Heavy adapter dependencies imported via `await import(...)` inside the adapter body, not at the top of the file. This mirrors every other route file and avoids pulling IBKR/Amadeus/etc. into bot startup.
- [ ] `validate` either returns `{ kind: "validated", input }` or short-circuits via `throw new ShortCircuit(status, body)` / `{ kind: "short_circuit", ... }`. Never return a `Response` from `validate`.
- [ ] "Lenient" endpoints (return 200 + empty body instead of 400 on short queries) use `requireMinLength(value, 2, emptyBody)` for consistency.
- [ ] The route is invoked at the **top** of the route file's handler, before any inline `if (pathname === ...)` branches. Otherwise stale inline code shadows the config.
- [ ] If the path is reachable from local-mode PWA, add it to `SHORTCUTS_EXACT_PATHS` in `telegram/src/webapp/middleware/auth-gate.ts` — otherwise the local webapp's `proxyToCloud` injects the shortcuts key and cloud returns 403.
- [ ] Tests cover: validation failure (ShortCircuit 400), lenient short-query (ShortCircuit 200 with empty body), adapter success, adapter throw with error-status mapping, precheck denial. Mock the adapter via `mock.module(...)` before importing the route file — see `flights.test.ts`.

## Anti-patterns

- **Returning a `Response` from `validate`** → the factory can't inspect it; throw `ShortCircuit` or return the `ValidationResult` variant instead.
- **Eager top-level import of the adapter module** → loads into bot startup, defeats the per-route lazy-load boundary used across the route files.
- **Re-reading `req.body` after `safeJson(req)` / `req.json()`** → Bun's body stream is consumed once. If you need multiple body fields, destructure from a single `safeJson` call; don't chain `requireBodyField` with a second `req.json()`.
- **Broadening the shortcuts key allowlist indiscriminately** → each path there is reachable by any IoT client holding the static key. Only list read-only, non-mutating search/lookup endpoints. Anything that writes state stays JWT-only.
- **Duplicate inline branch left behind** → after moving a handler into a config, delete the old `if (pathname === "/api/..." && req.method === ...)` block. A stale branch will shadow the config because the route file's inline check runs *after* the factory invocation (whichever returns first wins).

## Extending

1. Pick the route file this endpoint belongs to (by prefix registered in `telegram/src/webapp/router.ts`). Don't create a new route file just for a search — colocate with the domain.
2. Declare the config at module scope above `handleXxxRoutes`.
3. Invoke it at the top of `handleXxxRoutes` (and `return searchResp` if non-null) before any inline branches.
4. Add an entry to `SHORTCUTS_EXACT_PATHS` in `auth-gate.ts` if the endpoint must work from local-mode PWA.
5. Add tests under `telegram/src/webapp/search/__tests__/` (factory-level) or in the route file's sibling `*.test.ts` (adapter-level, mocking the adapter module). Follow `flights.test.ts` for the `mock.module` pattern.
6. If the domain has multiple search endpoints, declare each as its own config and chain them with `||` in the handler:
   ```ts
   const resp = (await searchA(deps)) || (await searchB(deps)) || (await searchC(deps));
   if (resp) return resp;
   ```

## Why the factory exists

Before this pattern, 9 near-identical search handlers lived inline across 7 route files. Each one did its own ad-hoc `try { validate → quota → adapter → corsResponse } catch` boilerplate. A single regression (e.g. the `/api/flights/search` 403 under local-mode proxy — see commit history) had to be chased through 9 divergent copies. The factory centralizes validation / precheck / error mapping so the same fix applies once.
