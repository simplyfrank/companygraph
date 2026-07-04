# Adding a New Telegram Bot Command

> **⚠️ STALE STACK — ported from personalassistant, not yet rewired for companygraph.** Adds commands to the personalassistant Telegram bot (`telegram/src/…`). companygraph has no Telegram/bot workspace. Reconcile against this repo before following any instruction below.

Guide for adding a new `/command` to the bot. Touches 4-6 files across the stack.

## Files to Create/Modify

### 1. Action Handler (CREATE): `telegram/src/actions/<name>.ts`

The command logic. Pattern:

```typescript
import type { Context } from "grammy";
import { Card, sendCard } from "../ui/card";

export async function handle<Name>Command(ctx: Context): Promise<void> {
  const text = ctx.message?.text || "";
  const arg = text.replace(/^\/\w+\s*/, "").trim();

  // Subcommand routing
  if (!arg) {
    // Default: show overview
    const card = new Card()
      .title("Title")
      .field("Field", "value")
      .button("Action", "domain:action");
    await sendCard(ctx, card);
    return;
  }

  // Handle subcommands...
}

// Callback handlers (if using inline buttons)
export function register<Name>Callbacks(/* deps */) {
  return {
    handleCallback: async (ctx: Context, action: string, param: string) => {
      // Route callback actions
    },
  };
}
```

### 2. Route in Cloud Relay: `telegram/src/cloud/relay.ts`

Add command handler in the command routing section (~line 800+):

```typescript
import { handle<Name>Command } from "../actions/<name>";

// In the bot.command() section:
bot.command("<name>", async (ctx) => {
  await handle<Name>Command(ctx);
});
```

### 3. Register Callbacks: `telegram/src/ui/callbacks.ts`

If your command uses inline keyboard buttons, add a domain prefix in `routeCallback()`:

```typescript
case "<prefix>":
  // Import handler
  const { handle<Name>Callback } = await import("../actions/<name>");
  await handle<Name>Callback(ctx, cb);
  break;
```

Callback data format: `<prefix>:<action>:<param>` (max 64 bytes total).

### 4. Card Templates (optional): `telegram/src/ui/cards/<name>.ts`

For complex UIs, create dedicated card builders:

```typescript
import { Card } from "../card";

export function <name>Card(data: DataType): Card {
  return new Card()
    .title("Title")
    .field("Field", data.value);
}
```

### 5. Memory Module (if persisting data): `telegram/src/memory/<name>.ts`

```typescript
import { getDb } from "./db";

let initialized = false;

function init(): void {
  if (initialized) return;
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS <name> (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ...columns...
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  initialized = true;
}
```

Add migration in `telegram/src/memory/migrate.ts` if schema changes after initial release.

### 6. Register Command with BotFather

In `relay.ts`, add to the `setMyCommands` call:

```typescript
{ command: "<name>", description: "Short description" },
```

### 7. Skill File: `.claude/skills/<name>/SKILL.md`

Create for Claude to understand the command:

```markdown
# /<name> - Description

Usage and implementation details...
```

## Patterns to Follow

- **Card builder**: Always use `Card` fluent API for message rendering
- **Callback data**: Use 1-3 char domain prefix (check `callbacks.ts` for existing ones)
- **Agent calls**: Use `requireLocal(ctx, method, params)` for macOS operations
- **Claude reasoning**: Use `streamClaudeToTelegram()` for AI responses, `askClaude()` for decisions
- **Error handling**: Wrap in try/catch, reply with user-friendly error message
- **Offline support**: Check `localAgent.isConnected` before agent-dependent operations

## Checklist

- [ ] Action handler created in `actions/`
- [ ] Command routed in `cloud/relay.ts`
- [ ] Callbacks registered in `ui/callbacks.ts` (if using buttons)
- [ ] Card templates in `ui/cards/` (if complex UI)
- [ ] Memory module in `memory/` (if persisting data)
- [ ] Command added to BotFather list
- [ ] Skill file created in `.claude/skills/`
- [ ] Transpile check passes
