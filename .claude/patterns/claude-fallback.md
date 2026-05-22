# Three-Tier Claude Fallback

**When to use:** Adding any new entry point that asks Claude for reasoning (chat, ask,
execute, subagent). The chain is local-CLI → EC2-CLI → API; skipping tiers either
pays unnecessary money or breaks when the Mac is offline.
**Canonical example:** `telegram/src/cloud/claude-stream.ts:68` (`streamClaudeToTelegram`),
`telegram/src/cloud/anthropic-fallback.ts:784` (`streamViaCli`), `:1199` (`executeViaCli`),
`:1397` (`streamViaApi`), `:1679` (`askViaApi`), `:1923` (`streamWithFallback`)
**Auth-event recording:** `telegram/src/memory/claude-auth-events.ts:34`
(`projectFromAuthEvent`)
**Credentials bootstrap:** `telegram/src/cloud/load-secrets.ts` writes
`~/.claude/.credentials.json` on EC2 from AWS Secrets Manager.
**Related:** [subagent.md](subagent.md), [local-agent-rpc.md](local-agent-rpc.md)

## The three tiers (in order, always)

1. **Local agent CLI** — Mac online. Free via the Max subscription OAuth stored in
   `~/.claude/.credentials.json` on the laptop. Call `localAgent.call("claude_ask" |
   "claude_execute" | "claude_chat", params, timeout)`. This is the preferred path
   because (a) free, (b) latency from EC2 to laptop is offset by the laptop's faster
   local Claude config cache.
2. **EC2 Claude CLI** — Mac offline. Also free — `load-secrets.ts` writes the same
   Max-subscription credentials to `~/.claude/.credentials.json` on EC2 at boot and
   refreshes them every 30 min via the `claude_token_refresh` scheduler job. Call
   `streamViaCli` / `askViaCli` / `executeViaCli` / `spawnSubagentViaCli` from
   `cloud/anthropic-fallback.ts`.
3. **Anthropic API** — paid last resort. Requires `ANTHROPIC_API_KEY`. Call
   `streamViaApi` / `askViaApi` from the same module. `isApiFallbackAvailable()`
   gates this; `recordApiFallback(cause, detail)` logs every API-tier invocation
   so we can see where money is going.

`streamWithFallback` in `anthropic-fallback.ts:1923` is the composed helper that
walks tiers 2→3 automatically; tier 1 is always attempted by the *caller* (typically
cloud/claude-stream.ts) before delegating to the fallback module.

## Shape

```ts
// Typical cloud-side entry point
async function myClaudeEntry(prompt: string, opts: {...}) {
  const model = routeModel(prompt);   // sonnet default; opus for complex
  // Tier 1: local agent CLI
  if (localAgent.isMethodAvailable("claude_ask")) {
    try {
      const res = await localAgent.call("claude_ask", { prompt, model }, 60_000);
      if (res?.ok) return res.result;
      // fall through on !ok — typically auth or timeout
    } catch (e) {
      // WS drop mid-call — fall through
      log.warn("Local agent claude_ask failed", { error: String(e) });
    }
  }
  // Tier 2 + Tier 3: delegate to composed fallback
  return await streamWithFallback({ prompt, model, ... });
}
```

Model routing lives alongside: **Sonnet by default**, **Opus** when `prompt.length > 500`
OR the prompt contains trigger keywords (`plan`, `design`, `analyze deeply`,
`architecture`, `complex`). See `claude-stream.ts` for the canonical router.

Tool-access mode: only `claude_execute` (execution-queue subtask runner) passes
`--permission-mode bypassPermissions`. Everything else — chat, ask, subagents — uses
the default permission mode or the subagent's scoped `allowedTools`.

## Required (acceptance checklist)

- [ ] New entry point **tries all three tiers in order**. Tier 1 is a `localAgent.call`
      inside `try/catch`; tier 2+3 is `streamWithFallback` (or the matching
      `streamViaCli` → `streamViaApi` pair).
- [ ] Every tier transition is logged via the module logger (`log.info` / `log.warn`)
      with the reason (`agent_offline`, `auth_error`, `cli_missing`, `api_no_key`).
      Silent fallbacks hide regressions.
- [ ] Auth-relevant events go through the auth-event pipeline. When a CLI process
      fails with an auth error, `anthropic-fallback.ts` already emits `AuthEvent`s
      that `claude-auth-events.ts:projectFromAuthEvent` persists; do not bypass it.
- [ ] `recordApiFallback(cause, detail)` is called whenever tier 3 is reached. This
      is the one place that accounts for API spend.
- [ ] Mac-drop mid-call is handled: the local `call(...)` is inside `try/catch`, not
      just an `if (ws.connected)` guard. The WS can close between the check and the
      response.
- [ ] Model routing is consistent with other entry points: `routeModel(prompt)` or
      the equivalent sonnet/opus switch. Don't hardcode opus for short prompts —
      it's 5× the cost and slower.
- [ ] `--permission-mode bypassPermissions` is used **only** for execution-queue
      subtasks (`claude_execute`). Chat/ask/subagent paths must not set it; tools
      should stay permissioned.

## Anti-patterns

- **Calling the Anthropic API directly, skipping CLI tiers** → pays when the Max
  subscription would have served it free. This is the #1 cost regression in this
  codebase; the API is last resort, not convenient.
- **Missing `try/catch` around the local RPC call** → if the Mac drops the WebSocket
  mid-request, the promise rejects and the whole entry point errors out instead of
  falling to tier 2. The catch is mandatory, not defensive.
- **Swallowing tier failures without logging** → health monitoring and post-mortems
  rely on seeing "tier 1 failed, falling to tier 2 because agent_offline". A silent
  fallthrough looks like everything's fine until the bill arrives.
- **Shipping a new entry point without writing to `claude_auth_events`** → the auth
  dashboard (aggregated by `aggregateHealthMetrics` in `claude-auth-events.ts:107`)
  goes blind. Re-auth loops, token-expiry cascades, and permission errors become
  invisible until a user reports "Claude isn't working". Re-use the existing
  event-projection path; don't add a parallel logging channel.
- **Routing every prompt to Opus "to be safe"** → quadruples latency and cost.
  Model routing is a deliberate choice; follow the 500-char + keyword rule or add
  a justified new trigger.
- **Using `bypassPermissions` outside execution-queue paths** → the scoped
  permission model exists for a reason. Chat/ask entry points should respect it
  so users get the usual approval flow.

## Extending

New Claude-facing feature → start from `cloud/claude-stream.ts` as the reference
for the tier-1 attempt + `streamWithFallback` composition. For a non-streaming
entry point (scheduler decisions, one-shot triage), use the `askViaCli` /
`askViaApi` pair instead. For a scoped specialist (deterministic scope, structured
output, restricted tools), prefer adding a [subagent](subagent.md) over wiring a
new entry point — subagents get the fallback chain for free via
`spawnSubagentViaCli`.
