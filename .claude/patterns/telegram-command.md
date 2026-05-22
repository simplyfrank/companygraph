# Telegram Command

**When to use:** Adding a new `/command` to the bot.
**Canonical example:** `telegram/src/cloud/commands/registry.ts::registerCommands`
**Handlers live in:** `telegram/src/actions/<domain>.ts`
**Callback router:** `telegram/src/cloud/commands/callbacks.ts`
**Text interceptors (multi-step state):** `telegram/src/cloud/interceptors.ts`
**Related:** [notifications.md](notifications.md), [websocket-auth.md](websocket-auth.md)

## Shape

Handler file — `telegram/src/actions/<name>.ts`:

```ts
import { Context, InlineKeyboard } from "grammy";

export async function handleXxxCommand(ctx: Context, arg?: string): Promise<void> {
  if (!arg) {
    await ctx.reply("Usage: /xxx <arg>");
    return;
  }
  const kb = new InlineKeyboard().text("Do it", `xxx:act:${id}`);
  await ctx.reply(`<b>Xxx</b>\n${escapeHtml(detail)}`, {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}
```

Registration — `cloud/commands/registry.ts`:

```ts
// Inline (rare — for core commands):
bot.command("xxx", async (ctx) => {
  const arg = ctx.match?.trim();
  await handleXxxCommand(ctx, arg || undefined);
});

// Lazy-import (standard — keeps startup fast):
bot.command("xxx", async (ctx) => {
  const { handleXxxCommand } = await import("../../actions/xxx");
  await handleXxxCommand(ctx);
});
```

Callback routing — if the command uses inline buttons, reserve a domain prefix
(see CLAUDE.md "Callback Domains — 26 prefixes"). Add a case to
`cloud/commands/callbacks.ts` or register a handler through `ui/callbacks.ts`
`routeCallback`. Callback-data format is `<prefix>:<action>:<arg>` — e.g.
`f:on:deep-work`, `b:v:12`.

Multi-step text capture — if the command needs the next user message as input,
add an `isWaitingForXxx(chatId): boolean` + `handleXxxMessage(ctx)` pair in the
action file and wire them into `cloud/interceptors.ts` alongside existing
`isWaitingForAdd` / `isWaitingForEdit` / `isWaitingForOauthCode` checks (all
dynamically imported).

Cards & keyboards — if the command surfaces structured data, build with
`ui/card.ts::sendCard` + a card builder under `ui/cards/` and declare reusable
keyboards in `ui/keyboards.ts`. Do not hand-roll HTML string fragments for
repeated card-style UI.

## Required (acceptance checklist)

- [ ] Handler named `handle<Xxx>Command(ctx, ...)` in `telegram/src/actions/<name>.ts`.
- [ ] Registered in `cloud/commands/registry.ts::registerCommands`.
- [ ] `parse_mode: "HTML"` for any formatted reply (supported tags: `<b>`, `<i>`, `<code>`, `<pre>`, `<a>`).
- [ ] User-provided strings in HTML go through `escapeHtml` from `ui/formatting.ts`.
- [ ] Callback prefix reserved in CLAUDE.md's 26-prefix callback-domains table before use.
- [ ] Callback data ≤ 64 bytes (Telegram hard limit).
- [ ] Messages chunked / truncated to ≤ 4000 chars (Telegram hard limit).
- [ ] Multi-step flow uses the `isWaitingFor<Xxx>` pattern, wired in `cloud/interceptors.ts`.
- [ ] Command listed in CLAUDE.md "Quick Commands" and the per-action table.
- [ ] Tests in `telegram/src/actions/<name>.test.ts` if routing/parsing is non-trivial.

## Anti-patterns

- New callback prefix that isn't reserved in the 26-domain list → silent overlap
  with another feature's dispatcher, wrong handler fires.
- `parse_mode: "Markdown"` → legacy, breaks on special characters in user data;
  HTML is the codebase default.
- Message body > 4000 chars without paging → Telegram rejects the `sendMessage`
  call, user sees nothing.
- Ad-hoc booleans inside a handler module for "waiting for reply" state — use
  the exported `isWaitingFor<Xxx>` / `handleXxxMessage` pair so the single text
  interceptor in `cloud/interceptors.ts` stays the source of truth.
- Importing heavy action modules at the top of `registry.ts` — inflates cold
  start. Follow the existing lazy `await import(...)` convention for
  non-core commands.
- Calling `ctx.reply` directly for *proactive* alerts (scheduler/lifecycle) —
  that's what [notifications.md](notifications.md) is for; `ctx.reply` is only
  for direct command responses.

## Extending

1. Create `telegram/src/actions/<name>.ts` exporting `handle<Xxx>Command` (and any `isWaitingFor<Xxx>` + `handle<Xxx>Message` pair).
2. Add a `bot.command("<name>", ...)` entry in `cloud/commands/registry.ts`.
3. If it has callbacks, pick/reserve a prefix in the 26-domain table and register the handler.
4. If it uses a card UI, add a builder to `ui/cards/<name>.ts`.
5. Add the command to the relevant tables in `.claude/CLAUDE.md`.
6. Transpile check: `bun build src/cloud/relay.ts --no-bundle > /dev/null`.
