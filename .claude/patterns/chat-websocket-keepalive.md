# Chat WebSocket Keep-Alive

**When to use:** Editing `/ws/chat` (or any long-lived browser-to-EC2 WS that goes through CloudFront), or adding a new long-running silent server path that handlers the chat WS.
**Canonical example:** `telegram/src/webapp/ws/chat.ts` (`server_ping` loop + `withTaskHeartbeat`), `pwa/components/chat-connection.js` (`_checkLiveness`, `_postWsEvent`).
**Tests:** `pwa/__tests__/chat-connection-backoff.test.ts` (19 cases incl. the silent-window + task_heartbeat lock-down).
**Related:** [pwa-view.md](pwa-view.md), [websocket-auth.md](websocket-auth.md), [test-pwa-classic-script.md](test-pwa-classic-script.md), `.claude/CLAUDE.md` (`/ws/chat` row).

## The four layers (must all agree)

A persistent WebSocket between the PWA and EC2 has four independent timeouts. If any one of them fires before another sees inbound traffic, the connection drops:

| Layer | Setting | Where | Value |
|---|---|---|---|
| Client liveness | `_lastPongAt` watchdog | `pwa/components/chat-connection.js:_checkLiveness()` | tick 15s, threshold 45s |
| CloudFront edge | `origin_read_timeout` | `terraform/main.tf` ec2-api origin's `custom_origin_config` | **60s** (max without AWS quota) |
| Bun.serve | `idleTimeout` (TCP-level) | `telegram/src/webapp-server.ts` `Bun.serve({ idleTimeout: 120 })` | 120s |
| OS TCP | `tcp.keepalive` | same Bun.serve block | enabled, 30s probe |

The **binding constraint is CloudFront's 60s**. Bun is more permissive; OS TCP is a separate concern. Client liveness is a UX-side tripwire, not a transport timeout.

## Server-emitted traffic that keeps the connection alive

Three message types reset the client's `_lastPongAt` (line 342 in chat-connection.js fires unconditionally for every inbound message):

| Type | Cadence | Where | Purpose |
|---|---|---|---|
| `server_ping` | 20s | `chat.ts` keep-alive `setInterval(..., 20_000)` | Baseline traffic for ALL connections |
| `pong` | reactive (≤25s) | `chat.ts` ping/pong handler | Reply to client's `ping` (every 25s) |
| `task_heartbeat` | 15s during a wrapped task | `chat.ts withTaskHeartbeat()` | Keeps the link alive when the work-path is silent (e.g. `/research`, `/buy`, `planWorkflow()`) |

`server_ping` + `pong` give every chat session ≥one inbound message every ~12.5s on average. A naïve handler covers 95% of the cases.

The 5% that breaks: **paths where the server sits silent on the WS for >60s while doing async work** (Claude reasoning without streaming). Those MUST be wrapped in `withTaskHeartbeat`.

## Shape

```ts
// in webapp/ws/chat.ts
import { withTaskHeartbeat } from "...";   // exported from this same file

// Bad — silent for the duration of startResearchPlan; CloudFront cuts at 60s:
void (async () => {
  await startResearchPlan(topic, tabId, broadcastForOwner);
})();

// Good — heartbeat every 15s, all owner sessions stay alive:
void (async () => {
  await withTaskHeartbeat(
    { ownerKey: session.ownerKey, tabId, taskKind: "research" },
    () => startResearchPlan(topic, tabId, broadcastForOwner),
  );
})();
```

```js
// in pwa/components/chat-connection.js — observability hook on reconnect
this._postWsEvent('reconnect', 'liveness_timeout', silentMs);
```

## Required (acceptance checklist)

- [ ] CloudFront `origin_read_timeout` is set to **60** in `terraform/main.tf` for the EC2 API origin. Default is 30s; without this it cuts WAY too aggressively.
- [ ] Server `server_ping` cadence is **20s** (3 pings per 60s CF window). 30s would be exactly at the boundary with no jitter margin.
- [ ] `TRANSIENT_WS_TYPES` set in `chat.ts` includes `"task_heartbeat"` so it doesn't get buffered in the owner-event replay buffer.
- [ ] Every server path that calls into a long-running silent operation (no `wsSend` for >30s) is wrapped in `withTaskHeartbeat()`. Default `intervalMs: 15_000`.
- [ ] Client `_checkLiveness()` threshold is **45s** with **15s** tick. Two missed expected messages → reconnect.
- [ ] Client posts `{event:"reconnect", reason, silentMs}` to `POST /api/chat/ws-event` on every reconnect (auth-aware, best-effort).
- [ ] Server `/api/chat/ws-event` increments `pa_chat_ws_reconnect_total{reason}` + `pa_chat_ws_silent_window_total{bucket}` from the client report.
- [ ] Server emits `pa_chat_ws_silent_close_total{in_flight}` from `handleChatWsClose()` when a generation was in flight at close time.
- [ ] The pwa test harness has a fake-time test asserting (a) <45s of silence does NOT reconnect, (b) `task_heartbeat` resets `_lastPongAt`, (c) heartbeat does NOT bubble to `onMessage`.

## Anti-patterns

- **Setting `idleTimeout` on `Bun.serve` higher and assuming you're done** — Bun's idleTimeout is TCP-level, AND CloudFront in front of it has its own. Both must agree.
- **Treating a 30s `origin_read_timeout` as "fine"** — fine for HTTP request/response; lethal for streaming WS where Claude can think for 30-90s before producing the first token.
- **Sending `task_heartbeat` only on tasks the user can see** — it's a transport-level concern; ALL silent server paths need it, including background workflow planning, subagent fallbacks, etc.
- **Adding the heartbeat at the call site instead of wrapping the work** — call sites change; wrapping `() => doSilentWork()` keeps the heartbeat in scope for as long as the work runs.
- **Forgetting to add new message types to `TRANSIENT_WS_TYPES`** — if `task_heartbeat` ends up in the owner-event replay buffer, every reconnect replays old heartbeats. Cluttery and meaningless.
- **Loosening the client liveness threshold to "be safe"** — every loosening means another N seconds of frozen UI when the connection is genuinely dead. The tight 45s threshold combined with the heartbeat is the right answer.
- **Hardcoding `_postWsEvent` to never throw** — it already doesn't (best-effort fetch with `.catch(() => {})`). Don't add an `await` that lets a metrics POST block the reconnect path.

## Extending

To add a new long-running silent server path:

1. Identify the call site that has `await someExpensiveCall()` with no intermediate `wsSend()`.
2. Wrap it: `await withTaskHeartbeat({ ownerKey, tabId, taskKind: "<short-label>" }, () => someExpensiveCall());`. The `taskKind` is purely for client-side display; pick a slug (`research`, `subagent`, `background_plan`, etc.).
3. If the call should also surface progress to the user, add an `onTaskProgress(`heartbeat:<taskKind>`, data)` handler in the host (e.g. `chat-state.js`) that increments an "elapsed" counter on the in-flight message.
4. Add a single test in `chat-connection-backoff.test.ts` advancing time past 45s with periodic `task_heartbeat` messages and asserting the WS isn't torn down.

To raise CloudFront's read timeout above 60s, you need an AWS account-level quota increase (the per-distribution max is 60s by default for the standard read-timeout policy). Document the request and link the AWS support ticket in the Terraform comment.
