# Architectural Patterns

**Audience:** coding agents (Claude Code sessions, subagents) working on this
repository. If you're writing code that does X, find X in the table below and
read that pattern before you type.

**Why this directory exists:** the codebase has strong conventions — SQLite
module shape, scheduler job contract, registry + coverage-test pairing,
per-file test runner, etc. When a pattern isn't followed, the code either
silently breaks in production (migrations rerun on fresh DBs), silently
breaks in tests (mock.module cross-file pollution), or decays the next agent
who has to re-derive the rules from scratch. This directory is the canonical
reference so derivation isn't needed.

## How to use

- **Before writing new code in an area**, skim the relevant pattern file.
- **Before reviewing code**, check it against the pattern's acceptance
  checklist.
- **When you discover a new convention or a gap**, add a pattern file here
  and index it below.
- **Patterns are versioned with the code.** If a pattern file disagrees with
  the code, the code won the last argument — update the pattern.

## Pattern file format

Every pattern file follows this shape so agents can parse them mechanically:

```markdown
# <Pattern Name>

**When to use:** <one-line trigger>
**Canonical example:** `path/to/file.ts:LINE`
**Tests:** `path/to/tests.ts`
**Related:** <other pattern files, specs>

## Shape

<minimal copy-pasteable code>

## Required (acceptance checklist)

- [ ] <check 1>
- [ ] <check 2>

## Anti-patterns

- <what NOT to do> → <why it fails>

## Extending

<how to add a new instance>
```

## Index

### Core architecture

| Pattern | When to use | File |
|---|---|---|
| Memory module | New SQLite persistence layer | [memory-module.md](memory-module.md) |
| Migration | New DB schema change | [migration.md](migration.md) |
| Registry + coverage test | Unified interface over N instances | [registry.md](registry.md) |
| Scheduler job | New cron-like background task | [scheduler-job.md](scheduler-job.md) |
| Local agent RPC | New macOS / Claude CLI method | [local-agent-rpc.md](local-agent-rpc.md) |
| Subagent | New scoped Claude specialist | [subagent.md](subagent.md) |
| Telegram command | New `/command` in the bot | [telegram-command.md](telegram-command.md) |
| Search route | New read-only `/api/<domain>/search` endpoint | [search-route.md](search-route.md) |
| PWA view | New vanilla-JS SPA route | [pwa-view.md](pwa-view.md) |
| PWA component | New shared visual primitive in `pwa/components/` | [pwa-component.md](pwa-component.md) |
| WebSocket auth | New agent-server handshake | [websocket-auth.md](websocket-auth.md) |
| Chat WS keep-alive | Editing /ws/chat or any long-lived browser WS through CloudFront | [chat-websocket-keepalive.md](chat-websocket-keepalive.md) |
| Three-tier Claude fallback | New Claude reasoning entry point | [claude-fallback.md](claude-fallback.md) |

### Cross-cutting

| Pattern | When to use | File |
|---|---|---|
| Notifications | New user-facing alert | [notifications.md](notifications.md) |
| Provenance events | New memory read/write surface | [provenance-events.md](provenance-events.md) |
| Domain ledger | New per-domain `<X>_events` table with bus emission | [domain-ledger.md](domain-ledger.md) |
| Decay job | New table with retention needs | [decay-job.md](decay-job.md) |
| Agent memory | Persisting cross-session rules, processes, or facts | [agent-memory.md](agent-memory.md) |
| Dropbox routing | New Dropbox op or change to env-aware routing policy | [dropbox-routing.md](dropbox-routing.md) |
| Stitch — when to use | Any UI work — decide whether Stitch is in the loop before generating | [stitch-when-to-use.md](stitch-when-to-use.md) |
| Design apply | A design artifact landed in `docs/design/` and must be applied to the PWA (fresh or migration) under the canonical DS | [design-apply.md](design-apply.md) |

### Tests

| Pattern | When to use | File |
|---|---|---|
| Test harness | Running tests locally or in CI | [test-harness.md](test-harness.md) |
| DB state isolation | Any test that writes to SQLite | [test-db-isolation.md](test-db-isolation.md) |
| Module-state reset | Any module with module-top `let` / `Map` singletons | [test-module-reset.md](test-module-reset.md) |
| Fake time | Any test of setTimeout / Date.now logic | [test-fake-time.md](test-fake-time.md) |
| PWA classic-script test | Testing `pwa/components/*.js` | [test-pwa-classic-script.md](test-pwa-classic-script.md) |
| Migration smoke | Migrations must pass before deploy | [test-migration-smoke.md](test-migration-smoke.md) |

### Process

| Pattern | When to use | File |
|---|---|---|
| Commit messages | Any commit on main | [commit-messages.md](commit-messages.md) |
| Spec workflow | Multi-phase feature implementation | [spec-workflow.md](spec-workflow.md) |
| Parallel-session CI/CD | Starting a Claude Code session that will touch >1 file | [parallel-session-cicd.md](parallel-session-cicd.md) |

## Source-of-truth files this directory mirrors

These files have the *runnable* definitions; pattern docs reference them:

| Runtime artifact | Pattern doc |
|---|---|
| `telegram/src/memory/dimensions.ts::LIFE_DIMENSIONS` | registry.md |
| `telegram/src/memory/memory-source-registry.ts::MEMORY_SOURCES` | registry.md |
| `telegram/src/context/slot-registry.ts::SLOT_REGISTRY` | registry.md |
| `telegram/src/cloud/capability-registry.ts::CAPABILITIES` | registry.md |
| `telegram/src/cloud/scheduler-jobs/types.ts::JobEntry` | scheduler-job.md |
| `telegram/src/local/agent.ts::methods` | local-agent-rpc.md |
| `telegram/src/subagents/skills/*.md` | subagent.md |
| `telegram/src/memory/db.ts::getDb` + `assertSafeDbPath` | test-harness.md |
| `telegram/tests/db-helpers.ts` | test-db-isolation.md |
| `telegram/src/_testing/module-reset-registry.ts` | test-module-reset.md |
| `telegram/tests/fake-time.ts` | test-fake-time.md |
| `telegram/scripts/test-local.sh` | test-harness.md |
| `scripts/hooks/pre-commit`, `pre-push`, `commit-msg` | commit-messages.md |

## Non-patterns

Things that look like they should be patterns but aren't — usually because
the single implementation is correct and copying it creates duplication:

- **Cloud entry point** (`cloud/relay.ts`) — single file, not a pattern family.
- **Claude streaming** (`cloud/claude-stream.ts`) — the function, not a shape.
- **Dropbox API wrapper** — single integration, not a reusable shape.

If you think you've found a pattern but only one instance exists, wait for
the second instance before adding a file here. Premature patterns rot.
