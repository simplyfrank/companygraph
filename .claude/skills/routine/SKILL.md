---
name: routine
description: Run a daily or weekly macOS routine — `/routine morning` (open work apps, show calendar/mail), `/routine evening` (save layout, close apps, recap), `/routine weekly` (clean downloads/desktop, plan next week). Use ONLY when the user explicitly types `/routine` or one of the three sub-aliases. Do not invoke from generic morning-planning chat.
---

# /routine - Daily & Weekly macOS Routines

Three subcommands behind a single skill. Each one is a thin wrapper over the canonical script in `./scripts/routines/`; the script is the source of truth, this file documents intent + expected output shape.

## Usage

- `/routine morning` (alias: `/morning`) — start-of-day setup
- `/routine evening` (alias: `/evening`) — end-of-day cleanup
- `/routine weekly`  (alias: `/weekly`)  — Friday/Sunday review

## morning — Startup

**Does**: open Mail/Calendar/Slack, fetch today's events + unread count, restore last layout, optionally start playlist.

```bash
./scripts/routines/morning-startup.sh
# Or step by step:
open -a Mail; open -a Calendar; open -a Slack
osascript ./scripts/apps/calendar.scpt today
osascript ./scripts/apps/mail.scpt unread_count
./scripts/windows/restore-layout.sh default
```

**Output shape** — date + day, today's events (time + title), unread mail count, apps launched, layout restored.

## evening — Cleanup

**Does**: save window layout, optionally close browser tabs (offer bookmark first), quit Slack/Mail/Messages, show daily summary, prompt for tomorrow's top-3.

```bash
./scripts/routines/evening-cleanup.sh
# Or step by step:
./scripts/windows/save-layout.sh evening-save
osascript -e 'tell application "Slack" to quit'
osascript -e 'tell application "Mail" to quit'
osascript -e 'tell application "Messages" to quit'
osascript ./scripts/apps/safari.scpt close_all_tabs   # only after user confirms
```

**Interactive gates** — always ask before closing browser tabs or quitting apps with unsaved work.

**Output shape** — active apps with time-spent estimates, focus sessions today, what was saved, what was closed, then `What are your top 3 priorities for tomorrow?`.

## weekly — Review

**Does**: archive Downloads >7d old, organize Desktop, show next-week calendar overview, summarize this-week activity, prompt for weekly goals.

```bash
./scripts/routines/weekly-review.sh
# Or step by step:
find ~/Downloads -type f -mtime +7 -exec mv {} ~/Downloads/Archive/ \;
osascript ./scripts/apps/finder.scpt organize_desktop
osascript ./scripts/apps/calendar.scpt next_week
./scripts/hooks/session-log.sh weekly-summary
```

**Desktop organization** — Screenshots → `~/Documents/Screenshots/`, Downloads → `~/Documents/Downloads/`, everything else → `~/Documents/Misc/`.

**Output shape** — cleanup stats (files archived/organized, GB freed), per-day next-week meeting counts, this-week focus hours, most-used apps, then `What are your goals for next week?`.

## After running any of the three

Show the structured output. Offer a follow-up: morning → `/focus deep-work`, evening → `/quick dnd-on`, weekly → `/backlog review`.
