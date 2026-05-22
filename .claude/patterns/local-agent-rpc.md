# Local Agent RPC Method

**When to use:** Adding a new macOS automation, Claude CLI, Dropbox, git/worktree, or
other capability exposed to the cloud bot over the local agent's WebSocket.
**Canonical example:** `telegram/src/local/agent.ts:194` (focus), `:370` (mail),
`:302` (reminders). 59 methods total, grouped by category inline.
**Action-queue integration:** `telegram/src/cloud/action-queue.ts:15` (`QUEUEABLE_METHODS`)
**Tests:** `telegram/src/local/__tests__/` (per-method where available)
**Related:** [websocket-auth.md](websocket-auth.md), [claude-fallback.md](claude-fallback.md)

## Shape

Add a method to the `methods` object in `telegram/src/local/agent.ts`. The RPC dispatcher
(same file) looks up `methods[params.method]` and invokes it with the params object.

```ts
// inside the `methods` object in telegram/src/local/agent.ts
async my_method(params: { path: string; limit?: number }): Promise<{
  ok: boolean;
  result?: { count: number; items: string[] };
  error?: string;
}> {
  if (!params.path) return { ok: false, error: "path required" };
  try {
    const raw = await runOsascriptFile("./scripts/apps/my-thing.scpt", {
      args: [params.path, String(params.limit ?? 10)],
      timeout: 30_000,   // override default 15s for long ops
    });
    return { ok: true, result: parseResult(raw) };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
```

Streaming methods (like `claude_chat`, `subagent_stream`, `browser_fill_cart`) return
immediately with `{ ok: true }` and emit `{ id, type: "stream_delta", text }` messages
on the same WebSocket via the id-correlated emit helper passed by the dispatcher.
See `handleClaudeChat` in `local/agent.ts` for the streaming pattern.

## Required (acceptance checklist)

- [ ] Method takes exactly **one argument: an options object**. No positional args beyond
      it. Every other method in the registry takes `(params: {...})`; diverging breaks
      the uniform `methods[name](params)` dispatch.
- [ ] Return shape is `{ ok: boolean, ... }`. Success adds `result` (or named fields);
      failure adds `error: string`. **Never throw** — cloud-side callers
      (`localAgent.call(...)`) assume the `{ ok, error }` shape and surface `error` to
      the user. An uncaught throw becomes a generic WebSocket RPC failure.
- [ ] Name is `snake_case` (`git_worktree_create`, `mail_mark_read`, `claude_ask`).
      Cloud callers pass the string verbatim; camelCase or kebab-case breaks lookup.
- [ ] Long-running ops (mail_read, claude_execute, browser_*) pass an explicit
      `timeout` to `runOsascriptFile` / `Bun.spawn` / `fetch`. Default cloud-side RPC
      timeout is 15s; methods that need longer must not rely on it.
- [ ] If the method should be **replayed when the Mac comes back online** (user
      pressed "focus deep-work" while offline), add its name to `QUEUEABLE_METHODS` in
      `telegram/src/cloud/action-queue.ts:15`. Current set:
      `focus, unfocus, apps, layout, run_task, system`. Status/mail/calendar/claude_*
      are **not** queueable because the response would be stale.
- [ ] Update CLAUDE.md "Local Agent RPC Methods" table: bump the total count and add
      the method to its category row. The count in the section header (e.g.
      "59 total") must match the actual method count.
- [ ] For streaming methods, return `{ ok: true }` **immediately** after validating
      params; emit deltas via the dispatcher's id-correlated emit, then a final
      `{ id, result: {...} }`. Do not buffer the whole stream and return at the end —
      the point of streaming is incremental UI updates.

## Anti-patterns

- **Throwing instead of returning `{ ok: false, error }`** → cloud callers do
  `if (!result.ok) { notify(result.error) }`. An uncaught throw propagates as a
  generic WS error with no user-actionable message. Every existing method (see
  `mail_send`, `dropbox_list`, `focus`) catches and returns the shape.
- **Spawning long-lived processes without a timeout** → RPC methods must terminate.
  A hung `osascript` with no timeout locks the method id and the cloud-side
  `localAgent.call` waits forever. Mail.app is the worst offender — always pass
  `{ timeout: 30_000 }` or higher.
- **Positional args** (`async my_method(path: string, limit: number)`) → inconsistent
  with every other method; cloud dispatcher sends a single params object.
- **Forgetting to add to `QUEUEABLE_METHODS` for a user-intent action** → pressing
  "focus deep-work" on the phone while the Mac is asleep silently no-ops instead
  of queuing. The action-queue is how offline UX works.
- **CLAUDE.md count drifts from reality** → the table is the index humans and
  Claude use to discover methods. When it says "44 total" but there are 59, the
  next agent searches for a method that's there and concludes it's missing.
- **Streaming that buffers then returns at the end** → defeats the stream.
  The PWA/Telegram UI shows no progress, times out, or looks hung.

## Extending

The `methods` object is alphabetized roughly by category (focus, layout, apps, system,
status, calendar, reminders, mail, tasks, voice, dropbox, claude, browser, git). Add
new methods near their category peers so the 2000-line file stays navigable. Categories
that reach ~15 methods should consider extraction into a sibling file that re-exports
back into `methods` (see `local/macos.ts` for the helper-extraction precedent, though
the methods themselves still live in `agent.ts`).
