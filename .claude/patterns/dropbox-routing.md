# Dropbox Routing

**When to use:** Adding a new Dropbox operation, changing routing policy, or
debugging a "Dropbox unavailable" error path.
**Canonical example:** `telegram/src/cloud/dropbox-router.ts` (`dropboxCall`),
`telegram/src/cloud/dropbox-legs/{on-device-fs,cloud-api,cloud-agent}.ts`
**Tests:** `telegram/src/cloud/__tests__/dropbox-router.test.ts`,
`telegram/src/cloud/dropbox-legs/__tests__/*.test.ts`,
`telegram/src/tools/schemas/__tests__/dropbox.test.ts`
**Related:** [registry.md](registry.md), [local-agent-rpc.md](local-agent-rpc.md),
[migration.md](migration.md), [decay-job.md](decay-job.md)

## Shape

One environment-aware router (`dropboxCall`), three swappable legs:

```ts
// Single dispatch surface — every Dropbox operation flows through here.
export async function dropboxCall(
  method: string,
  params: Record<string, any>,
  opts?: { timeoutMs?: number },
): Promise<any> {
  const env = getDropboxEnvironment();         // 'on-device' | 'cloud-bot' | 'off-device'
  const legs = legsFor(env);                   // ordered Leg[] for this env
  if (legs.length === 0) throw DropboxError.noLegs([]);
  for (const leg of legs) {
    try {
      return await leg.call(method, params, opts?.timeoutMs);
    } catch (err) {
      // FALLTHROUGH_CODES = transient | auth_error  → try next leg
      // Other DropboxErrorCode (path_not_found, malformed_path, …) → short-circuit
    }
  }
  throw new DropboxError("all_legs_failed", "...", { leg_attempts: ... });
}
```

Routing policy by environment:

| Environment | Legs (in order) | Why |
|---|---|---|
| `on-device` (MCP child on Mac) | `[on-device-fs, cloud-api]` | Direct fs is fastest; API as fallback if `~/Dropbox` sync stalls. |
| `cloud-bot` (EC2 bot) | `[cloud-api, cloud-agent]` | Cloud-first per 2026-04-19 flip; agent leg covers credential-rotation windows. |
| `off-device` (other process) | `[cloud-api]` | Only path is the HTTP API. |

Typed errors via `DropboxError` (single class, stable `code` field):

```ts
export type DropboxErrorCode =
  | 'path_not_found' | 'path_conflict' | 'malformed_path'
  | 'permission_denied' | 'auth_error' | 'payload_too_large'
  | 'transient' | 'all_legs_failed' | 'no_legs_available';
```

## Required (acceptance checklist)

- [ ] Every new Dropbox operation goes through `dropboxCall(method, params)` —
      no direct calls to `localAgent.call("dropbox_*", ...)` or `dbxList()`.
- [ ] Each leg's `call()` throws `DropboxError` (never raw errors). Use
      `normalizeError(rawErr, source)` from `dropbox-legs/normalize.ts` to convert.
- [ ] List/search results filtered through `IGNORE_PATTERNS` (DD-06) on every
      leg so `on-device-fs` and `cloud-api` produce equivalent output (FR-15).
- [ ] No top-level `import { localAgent } from "./agent-server"` in
      `dropbox-router.ts`. Use lazy `getAgentRegistry()` (DD-12). The MCP child
      crashes on import-resolution if this regresses.
- [ ] The canonical no-legs message
      `"Dropbox unavailable: no legs available (no on-device root, no API credentials)"`
      lives in exactly one place: the `DropboxError.noLegs` factory at
      `dropbox-legs/types.ts`. AC-20 grep test enforces.
- [ ] Per-call observability: one structured log line + one
      `pa_dropbox_call_total{method, environment, leg, outcome}` counter per
      `dropboxCall` invocation (DD-04b).
- [ ] MCP `tools/list` filtering: file-op tools' `isAvailable` returns
      `isDropboxAvailable()` so they're hidden in off-device + no-API state.
      `dropbox_status` is exempt — always advertised.
- [ ] Binary content (`dropbox_download` / `dropbox_upload`) uses base64 envelope.
      Size check on raw `data: string` length (`> 50 * 1024 * 1024`) BEFORE
      `Buffer.from(data, "base64")` decode. Larger payloads return `payload_too_large`.

## Anti-patterns

- **Direct `localAgent.call("dropbox_*", ...)` in callers** — bypasses the env-aware
  policy; works on cloud-bot but silently fails when MCP runs on the Mac.
- **Synthesizing `"Dropbox unavailable (...)"` strings inline** — divergent
  variants drift. Throw `DropboxError({code: "no_legs_available", ...})` and
  let the caller render via `e.message`. (Informational log/UI hints with the
  word "Dropbox" are fine — the AC-20 invariant is on the canonical no-legs message only.)
- **Top-level static `import` of `cloud/agent-server` from any module the MCP
  child loads** — pulls a side-effect chain that crashes outside cloud-bot.
  Lazy `require` only.
- **Catching `DropboxError` and rethrowing a generic `Error`** — loses the
  `code` field that REST and PWA depend on for typed rendering.
- **Adding a "fallback to next leg" rule for `permission_denied` or `path_*`
  errors** — those are deterministic content errors. Falling through masks
  bugs and creates "magic retry" surprise. `auth_error` is the only
  fall-through code that's NOT transient.

## Extending

To add a new Dropbox operation (e.g. `dropbox_share`):

1. **Add the helper** in `actions/dropbox.ts` (for the on-device-fs leg) and the
   corresponding `dbxShare()` in `cloud/integrations/dropbox-api.ts` (for
   cloud-api leg) and an RPC handler in `local/agent.ts` (for cloud-agent leg).
2. **Wire each leg's `switch` block** in `cloud/dropbox-legs/{on-device-fs,
   cloud-api, cloud-agent}.ts` to dispatch on the new method name.
3. **Register the MCP tool** in `tools/schemas/dropbox.ts` with
   `agentCapability: "dropbox"`, `isAvailable: syncIsDropboxAvailable`,
   and `execute: (input) => safeExecute("dropbox_share", input)`.
4. **Add coverage** in `tools/schemas/__tests__/dropbox-mcp-coverage.test.ts`
   (stub `dropboxCall`, assert it was called).
5. If the operation is destructive, mark `dangerous: true` and `autoAllowed: false`.

To add a new leg (e.g. an internal cache layer):
1. Implement the `Leg` interface in `cloud/dropbox-legs/<name>.ts`.
2. Re-export from `cloud/dropbox-legs/index.ts`.
3. Add to `legsFor(env)` in `cloud/dropbox-router.ts` per the env(s) where it
   should run.
4. Update the `Environment → Legs` table at the top of this doc and any
   integration tests.
