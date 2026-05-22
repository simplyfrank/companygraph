# Scheduler Job

**When to use:** Adding a new cron-like background task that runs on the cloud scheduler tick.
**Canonical example:** `telegram/src/cloud/scheduler-jobs/maintenance.ts:35` (`morning_briefing`, `smart_checkin`, `backup_verification`, `daily_maintenance`, `worktree_gc`)
**Type definition:** `telegram/src/cloud/scheduler-jobs/types.ts:37` (`JobEntry`)
**Tests:** `telegram/src/cloud/__tests__/scheduler-jobs.test.ts`, `telegram/src/cloud/__tests__/stability-scheduler-recovery.test.ts`
**Related:** [decay-job.md](decay-job.md), [notifications.md](notifications.md), `memory/scheduler-side-effects.ts`

## Shape

Export a `JobEntry`-typed object into the appropriate `scheduler-jobs/<domain>.ts` map
(`maintenance.ts`, `finance.ts`, `tasks.ts`, `market.ts`, `travel.ts`, etc.).

```ts
// telegram/src/cloud/scheduler-jobs/<domain>.ts
import type { JobEntry } from "./types";
import {
  log, LONG_JOB_TIMEOUT_MS,
  getInterval, getWindow, getRunHour, getRunDay,
  minutesSince, hoursSince,
  markRun, todayAlready,
  getUserHour, getUserDayOfWeek, isWeekendDay,
  localAgent,
} from "./types";

export const myDomainJobs: Record<string, JobEntry> = {
  my_job: {
    // shouldRun: pure + cheap. No DB writes, no network I/O.
    shouldRun: async (force) => {
      const hour = getUserHour();
      const w = getWindow("my_job", 8, 20);
      if (hour < w.start || hour >= w.end) return { ok: false, reason: "outside_window" };
      const interval = getInterval("my_job", 30);
      if (minutesSince("my_job") < (force ? 1 : interval)) return { ok: false, reason: "too_soon" };
      if (todayAlready("my_job")) return { ok: false, reason: "already_ran_today" };
      if (!process.env.MY_API_KEY) return { ok: false, reason: "no_credentials" };
      return { ok: true };
    },

    execute: async () => {
      markRun("my_job");               // ← FIRST LINE. Always. Even before try/catch.
      const { doTheWork } = await import("../my-action");
      await doTheWork();
    },

    timeoutMs: LONG_JOB_TIMEOUT_MS,    // optional; only set for >30s jobs
  },
};
```

Register the map in `scheduler-jobs/index.ts` (or wherever the domain map is consumed
by `scheduler.ts`). The scheduler ticker invokes `shouldRun` each tick; on `{ ok: true }`
it calls `execute` with a timeout.

If the job produces external side effects (mail send, WhatsApp, Telegram, SaaS writes),
wrap the write in `runIdempotent(jobName, dedupeKey, fn)` from
`telegram/src/memory/scheduler-side-effects.ts:1` — a partial-failure retry without the
guard double-sends. Dedupe key should be stable (recipient + template id + YYYY-MM-DD);
never `Date.now()`. See the `secrets_refresh` job in `maintenance.ts:771` for a live example.

## Reliability is the dispatcher's job, not yours

Every `execute()` call is wrapped by `withFailureTracking()` at
`cloud/scheduler-dispatch.ts:571` (the canonical fire-and-forget path) and `:725` (the
manual-trigger path). That wrapper:

- runs the job inside a timeout race (default `JOB_TIMEOUT_MS`, override via
  `timeoutMs` on the `JobEntry`),
- records failures in the `scheduler_failures` table with category-aware
  exponential backoff,
- maintains a per-job circuit-breaker (`closed` → `open` → `half_open` → `closed`),
- promotes to the `scheduler_dlq` table after the retry budget is exhausted,
- recovers from DLQ when a half-open probe succeeds.

What this means for the job author:

- **Don't** wrap your `execute()` in `withFailureTracking()` or
  `withSchedulerRecovery()` yourself — double-wrapping double-logs and double-counts
  toward the retry budget.
- **Don't** swallow errors in `execute()`. Let them propagate so the dispatcher can
  classify them. If you must observe an internal failure (e.g. one of N items failed
  while N-1 succeeded), use `log.error(...)` for visibility and continue the loop —
  but propagate the *outer* error if the job as a whole failed.
- **Do** use the module `log` from `./types` for correlated logging; the dispatcher
  attaches `runId` so logs join up.

The `/api/scheduler/health` endpoint and the PWA scheduler-health widget read the
same tables the dispatcher writes — your job appears there automatically.

## Required (acceptance checklist)

- [ ] `markRun("<job_name>")` is the **first line of `execute`** — not the last, not
      inside an `if (success)` branch. Placing it at the end leaves `minutesSince()`
      returning `Infinity` forever when the job throws, so the scheduler retries every
      tick instead of honoring the interval.
- [ ] `shouldRun` is pure: only reads from `getUserHour`/`minutesSince`/`todayAlready`/
      `process.env`/`localAgent.hasCapability`/`localAgent.isMethodAvailable`. No DB
      writes. No network calls. No `await`s that could take >10ms.
- [ ] Time-of-day checks use `getUserHour()` / `getUserDayOfWeek()` — not
      `new Date().getHours()`. These helpers respect the user's configured timezone.
- [ ] Interval checks use `getInterval("<job_name>", defaultMinutes)` and window checks
      use `getWindow(...)` so user overrides via `user_settings` take effect without
      code changes.
- [ ] Job is exported from the domain map (e.g. `maintenanceJobs`) and that map is
      loaded by the scheduler.
- [ ] If the job takes >30s, set `timeoutMs: LONG_JOB_TIMEOUT_MS`.
- [ ] If the job sends external side effects, writes go through
      `runIdempotent(jobName, dedupeKey, fn)`.
- [ ] CLAUDE.md "Scheduler Jobs" table updated with interval + window.

## Anti-patterns

- **`markRun` at the end of `execute`** → a throw skips it; `minutesSince` stays at
  0; the scheduler retries every minute instead of every 30. The 30-min interval is
  silently degraded for an arbitrarily long time. Seen historically for morning
  briefing — fixed once; don't regress.
- **Raw `setTimeout` / `setInterval` instead of adding a `JobEntry`** → the scheduler
  knows nothing about it; no `markRun`/`minutesSince` bookkeeping; no failure tracking;
  no DLQ; no health endpoint visibility; no circuit breaker.
- **DB writes or network I/O inside `shouldRun`** → every tick pays the cost even when
  the job is not due. The scheduler loop stalls. Move the check into `execute` and
  return `{ ok: true }` cheaply.
- **`Date.now()` math for "is it 8 AM"** → breaks when DST shifts or when the user
  overrides `TZ`. Use `getUserHour() === getRunHour("<job>", 8)`.
- **Sending the same external artifact twice on retry** → wrap in `runIdempotent`.
  Re-sending a "payment reminder" email after a partial failure is a user-visible bug.
- **Swallowing errors in `execute` without logging** → the scheduler can't categorize
  the failure for `withSchedulerRecovery`. Log via the module `log` and rethrow or let
  the error propagate so DLQ/circuit-breaker can see it.

  See "Reliability is the dispatcher's job, not yours" above — the wrap lives at
  `cloud/scheduler-dispatch.ts:571`. The job's contract is the `JobEntry` shape
  (markRun-first + let-errors-propagate); the dispatcher handles the rest.

## Extending

To add a new job to an existing domain, append to the exported `Record<string, JobEntry>`
in that domain file. To add a new domain, create `scheduler-jobs/<domain>.ts` exporting
a `Record<string, JobEntry>` and wire it into the scheduler's job-load set in
`cloud/scheduler.ts`. The scheduler dispatches by job name, so names must be unique
across all domain maps.
