# Notifications

**When to use:** Any proactive / scheduled / background alert that reaches
the user (push, Telegram message). Not for direct command replies
(`ctx.reply` is fine there).
**Canonical example:** `telegram/src/cloud/notify.ts::notify`
**Push plumbing:** `telegram/src/cloud/push-notify.ts` (`sendPush`, `sendTypedPush`)
**Channel setting:** `notification_channel` in `telegram/src/memory/user-settings.ts`
(values: `"telegram" | "pwa" | "both"`, default `"both"`)
**HTML escape:** `telegram/src/ui/formatting.ts::escapeHtml`
**Related:** [telegram-command.md](telegram-command.md), [pwa-view.md](pwa-view.md)

## Shape

```ts
import { notify } from "../cloud/notify";
import { escapeHtml } from "../ui/formatting";

await notify({
  text: `<b>Flight check-in open</b>\n${escapeHtml(flight.number)} — ${escapeHtml(route)}`,
  parseMode: "HTML",
  title: "Check-in open",             // push notification title
  url: `/#/travel?flight=${flight.id}`,// PWA deep link (hash router)
  pushType: "task",                   // email | approval | assignment | task | general
  pushId: `flight-checkin:${flight.id}`, // stable dedup key — re-firing replaces, not stacks
  reply_markup: {                     // Telegram inline buttons (optional)
    inline_keyboard: [[{ text: "Check in now", callback_data: `flt:checkin:${flight.code}` }]],
  },
  // silent: true,                    // push only, no sound
  // critical: true,                  // bypass meeting queue, send immediately
});
```

`notify()` is the **only** entry point for automated alerts. It:

1. Reads `notification_channel` user setting and fans out to Telegram / push
   accordingly (`notify.ts:115-145`).
2. Queues non-critical notifications during meetings (via
   `calendar-router.isUserBusyNow()`), flushing on busy→free transition or
   30-min max hold (`notify.ts:151-186`). Queue capped at
   `MAX_QUEUE_SIZE = 200` — oldest non-critical drops if full.
3. Retries once on all-channels-failure after 5s (critical) / 10s
   (non-critical) — `sendImmediate()`.
4. Strips HTML tags before writing the push body
   (`sendPushNotification`, `notify.ts:218`) so PWA toasts are clean text.
5. Routes to `sendTypedPush` when `pushType` + `pushId` are both supplied —
   this enables inline notification action buttons in the PWA service worker.

`sendTelegramDirect()` is **exported** but reserved for two legitimate cases:
Telegram-only infrastructure (inline buttons that don't translate to push) and
fallback from `local/notify.ts` when the cloud is unreachable. Scheduler and
lifecycle code must not call it directly — use `notify()`.

## Required (acceptance checklist)

- [ ] Call is `notify({...})`, not `sendTelegramDirect` or a raw
      `fetch("https://api.telegram.org/...")`.
- [ ] `text` with HTML runs user-provided substrings through `escapeHtml`.
- [ ] `parseMode: "HTML"` set whenever `text` contains tags (Telegram default
      is plain text; unescaped `<` otherwise triggers a parse error and
      silent drop).
- [ ] `url` provided whenever the alert is actionable — format
      `/#/<view>?<query>` (hash router, see [pwa-view.md](pwa-view.md)).
- [ ] Stable `pushId` (namespaced `domain:id`) for recurring / updatable
      alerts so re-firing replaces the prior notification instead of stacking.
- [ ] `pushType` matches an action-bar category in the service worker
      (`email`, `approval`, `assignment`, `task`, `general`).
- [ ] `critical: true` **only** for safety-critical alerts (missed flight
      check-in, outage) — it bypasses the meeting queue.
- [ ] `text` ≤ 4000 chars (Telegram hard limit; `notify.ts:200` truncates
      but you should shape the payload upstream).

## Anti-patterns

- `sendTelegramDirect()` called from a scheduler job / lifecycle job —
  ignores the user's `notification_channel` preference and breaks PWA-only
  mode. Use `notify()`.
- Missing `pushId` on a recurring alert (e.g. "5 unread emails" every
  15 min) → the push stacks in the PWA notification tray instead of
  replacing the prior one.
- Raw user data interpolated into `text` with HTML parse mode → a single
  `<` in a subject line silently fails the whole Telegram send. Always
  `escapeHtml` first.
- Firing multiple `notify()` calls for one event ("new email", "subject
  available", "sender available") — consolidate into one card with action
  buttons via `reply_markup` and a push with `pushActions`.
- Importing `calendar-router` synchronously inside the job that *calls*
  `notify` — `notify()` already dynamically imports it with a busy-check
  fallback. Doing it again creates a circular-import risk.
- `critical: true` on every notification — defeats the meeting queue's
  purpose; users see all pings during calls again.
- Calling `process.env.TELEGRAM_BOT_TOKEN` at module scope for your own
  send path — env is populated by `load-secrets.ts` *after* imports; use
  lazy getters, or just call `notify()` and inherit the pattern.

## Extending

1. Call `notify({ text, title, url, pushType, pushId, parseMode, reply_markup })`.
2. Escape user data with `escapeHtml` from `ui/formatting.ts`.
3. Pick a stable `pushId` (`<domain>:<id>`) — this is the dedup contract.
4. Add a deep-link `url` pointing at the responsible PWA view/hash.
5. For Telegram inline-button actions, reserve a callback prefix per the 26-
   domain table (see [telegram-command.md](telegram-command.md)).
