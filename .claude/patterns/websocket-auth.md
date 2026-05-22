# WebSocket Auth

**When to use:** Adding a new WebSocket endpoint or modifying the handshake on
an existing one.
**Canonical examples:**
  - Local-agent WS (port 8080) — `telegram/src/cloud/agent-server.ts`,
    auth primitives in `telegram/src/cloud/agent-auth.ts`, audit in
    `telegram/src/cloud/agent-audit.ts`.
  - PWA chat WS (port 8443, via CloudFront `/ws/chat`) —
    `telegram/src/webapp/ws/chat.ts`, JWT middleware in
    `telegram/src/middleware/auth.ts`.
**Related:** [notifications.md](notifications.md), [pwa-view.md](pwa-view.md)

## Shape — local agent (port 8080, challenge-response)

1. Agent dials `ws://<cloud>:8080/agent?token=<AGENT_SECRET>` — Bun's
   `new WebSocket()` does **not** support custom headers, so the secret rides
   in the query string.
2. On upgrade, `verifyAgentTransportToken()` (`cloud/agent-auth.ts:44`)
   validates against `AGENT_SECRET` *and* `AGENT_SECRET_PENDING` (rotation
   window). Failure → close, record failure, drop.
3. Server issues a challenge: `{ type: "auth_challenge", challenge: <hex> }`
   via `generateChallenge(ip)`.
4. Client computes
   `crypto.createHmac("sha256", AGENT_SECRET).update(challenge).digest("hex")`
   and sends `{ type: "auth_response", response: <hmac> }`.
5. Server calls `verifyChallenge(...)` — HMAC match against either the current
   or pending secret completes authentication.
6. Rate limit: 5 failed auths in a 15 min window → exponential IP block
   starting at 60s, capped at 30 min (`agent-server.ts:87-130`).
7. Every connection attempt / auth result / rate-limit hit logged as JSON
   lines to `~/.claude-relay/agent-audit.log` via `agent-audit.ts`.
8. Heartbeat: ping every `WS_HEARTBEAT_MS` (30s), disconnect at
   `WS_TIMEOUT_MS` (90s). Constants in `telegram/src/shared/constants.ts`.

## Shape — PWA WS (port 8443, JWT via query param)

1. Client opens `wss://app.frankwinkler.me/ws/chat?token=<JWT>` where JWT is
   the Cognito access token from OAuth2 PKCE.
2. Upgrade handler validates the JWT via `middleware/auth.ts` (JWKS-backed).
   CloudFront origin secret is checked at the infra layer *on top of* JWT.
3. After upgrade, `WsData.jwtToken` is stashed for periodic re-validation (see
   `webapp/ws/chat.ts:52`). Expired token → server closes the socket.
4. Per-owner replay buffer: `ownerEventBuffer` (`chat.ts:1506+`) retains up to
   `OWNER_REPLAY_LIMIT` recent events per owner keyed by `seq`. On
   `{ type: "resume", lastSeenSeq }`, server replays the gap and emits
   `resume_ack { replayed, fromSeq, toSeq, gap }`. Gap → client treats the
   subsequent `state_snapshot` as authoritative and drops its eventId dedup
   map.
5. Duplicate-message suppression by `clientMsgId`
   (`isDuplicateClientMessage`, `chat.ts:1538`) — required for at-least-once
   delivery over flaky mobile links.
6. Per-owner buffers pruned when no sockets active for 5 min (`chat.ts:3962`).

## Secret handling

```ts
// WRONG — captures "" before load-secrets.ts runs.
const SECRET = process.env.AGENT_SECRET || "";

// RIGHT — lazy, re-reads on every call so rotation + late loading work.
function getAgentSecret(): string { return process.env.AGENT_SECRET || ""; }
```

All WS-auth code reads env **through a getter**, never a const at module load.
`load-secrets.ts` populates `process.env` after imports.

## Required (acceptance checklist)

- [ ] Secrets read through a function (lazy), never a module-load const.
- [ ] Token or JWT validated on `upgrade` — no path that accepts an unauthenticated socket.
- [ ] Failed-auth events go through the rate-limit counter *and* the audit log.
- [ ] Ping/pong configured with explicit interval + timeout (use `WS_HEARTBEAT_MS` / `WS_TIMEOUT_MS` constants).
- [ ] Resume/replay buffer is per-owner, bounded (`OWNER_REPLAY_LIMIT`), and prunes idle owners.
- [ ] Client-side dedup via `clientMsgId` for user-initiated messages that could retry.
- [ ] Origin check against `ALLOWED_ORIGINS` if the endpoint is browser-reachable (none-origin = direct WS is OK).
- [ ] CloudFront `ordered_cache_behavior` in `terraform/main.tf` covers the path — otherwise it routes to S3 SPA fallback.
- [ ] Audit log lines are structured JSON (no free-form strings).

## Anti-patterns

- Passing the secret or JWT in an HTTP header — Bun `new WebSocket()` drops
  custom headers. Use `?token=` query param.
- `const SECRET = process.env.AGENT_SECRET` at module scope — resolves to `""`
  because `loadSecrets()` runs after imports. Symptom: every auth attempt
  fails after deploy.
- No ping/pong — half-open sockets linger for minutes, RPC requests hang
  until OS-level TCP timeout.
- Unbounded per-session buffers (events / seenIds / pendingAcks) — memory
  grows forever in long conversations; always cap + prune.
- Reusing `seq` numbers across server restarts without a gap signal — client
  dedup suppresses legitimate new events. `chat.ts` handles this via the
  `hasGap` branch + snapshot-as-authoritative reset.
- Adding a new `/ws/*` path in `webapp-server.ts` without a matching
  CloudFront behavior in `terraform/main.tf` — traffic silently falls through
  to S3 and returns `index.html`. See CLAUDE.md "CloudFront routing blindspot".
- Closing a socket without recording the disconnection reason in audit logs —
  incidents become unreconstructable.

## Extending

1. Add the upgrade handler in `webapp-server.ts` (port 8443) or
   `agent-server.ts` (port 8080).
2. Wrap auth in the same challenge-response + rate-limit scaffolding as the
   canonical files.
3. If browser-reachable, add the CloudFront behavior under
   `terraform/main.tf::ordered_cache_behavior`.
4. Implement ping/pong, per-owner replay buffer, and `clientMsgId` dedup if
   the stream carries user messages.
5. Document the path + auth model in CLAUDE.md "WebSocket Endpoints".
