# Adding a Scheduler Job

> **⚠️ STALE STACK — ported from personalassistant, not yet rewired for companygraph.** Targets the personalassistant scheduler (`telegram/src/…`). companygraph has no scheduler workspace. Reconcile against this repo before following any instruction below.

Guide for adding a new scheduled job to the cloud bot.

## File: `telegram/src/cloud/scheduler.ts`

### Job Types

| Type | Gate | Example |
|------|------|---------|
| Once daily | `todayAlready(jobName)` + hour check | Morning briefing |
| Interval | `minsSinceLastRun >= N` + hour range | Email pipeline (15 min) |
| Agent-required | `localAgent.isConnected` guard | Mail, calendar operations |
| Claude-required | `localAgent.isConnected \|\| isApiFallbackAvailable()` | Price checks, decisions |

### Implementation Pattern

Add in the main `setInterval` block (~line 426):

```typescript
// === <JOB NAME> ===
// Frequency: <interval>, Hours: <start>–<end> ICT
if (hour >= START_HOUR && hour < END_HOUR) {
  const lastRun = getLastRun("job_name");
  const minsSinceLastRun = lastRun
    ? (Date.now() - new Date(lastRun + "Z").getTime()) / 60_000
    : Infinity;

  if (minsSinceLastRun >= INTERVAL_MINUTES) {
    // CRITICAL: markRun BEFORE execution to prevent retry loops on failure
    markRun("job_name");
    await runJobFunction().catch((e) =>
      console.error("[Scheduler] Job error:", e?.message)
    );
  }
}
```

For daily jobs:
```typescript
if (hour === TARGET_HOUR && !todayAlready("job_name")) {
  markRun("job_name");
  await runJobFunction().catch((e) => console.error(...));
}
```

### Critical Rules

1. **`markRun()` BEFORE execution** — If called only on success, failures cause 1-minute retry loops instead of respecting the interval.
2. **Guard for agent/fallback** — If the job needs macOS (mail, calendar), check `localAgent.isConnected`. If it only needs Claude reasoning, check `(localAgent.isConnected || isApiFallbackAvailable())`.
3. **Hour range uses ICT** — `getUserHour()` returns Bangkok time (UTC+7).
4. **Error handling** — Wrap in `.catch()`, never let errors crash the scheduler loop.
5. **SQLite datetime** — `getLastRun()` returns space-separated timestamps (not ISO T-separated). The code handles both formats.

### Job Function Pattern

```typescript
async function runMyJob(): Promise<void> {
  // 1. Check preconditions
  if (!localAgent.isConnected) {
    console.log("[Scheduler] My job skipped — laptop offline");
    return;
  }

  // 2. Gather data
  const data = await localAgent.call("method", params, 30_000);

  // 3. Process / decide (optional Claude)
  const decision = await askClaude(prompt, systemPrompt);

  // 4. Act (send notification, update state, etc.)
  await sendTelegram(message, parseMode);
}
```

### Failure Recovery Wrapper (Recommended)

All new jobs should use the failure recovery wrapper for automatic retry and monitoring:

```typescript
import { withSchedulerRecovery, FailureCategory } from "../memory/scheduler-failures";

async function runMyJob(): Promise<void> {
  // Job logic here
}

export default withSchedulerRecovery(runMyJob, {
  jobName: "my_job",
  category: "transient",  // or "dependency", "persistent", "critical"
  criticalityLevel: "medium",  // "low", "medium", "high", "critical"
});
```

**Failure Categories:**
- `transient` — Network issues, temporary agent offline (auto-retry 5x, 1min→1hr)
- `dependency` — Upstream API down (auto-retry 10x, 5min→2hr)
- `persistent` — Auth failure, missing data (2 retries → DLQ → alert)
- `critical` — DB corruption, crash (immediate alert, no retry)

**Criticality Levels:**
- `low` — Background cleanup, analytics (silent failures)
- `medium` — User-facing features (daily digest)
- `high` — Core workflows (immediate notification)
- `critical` — Data integrity, security (immediate alert + page)

### Sending Telegram Messages from Scheduler

```typescript
import type { Api } from "grammy";

// The bot API is available via closure in scheduler.ts
// Use the sendTelegram helper defined at the top of scheduler.ts
await sendTelegram(message, "HTML");
```
