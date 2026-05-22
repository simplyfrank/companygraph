# /morning - Morning Startup Routine

Start your day with a consistent routine that opens essential apps and shows relevant information.

## Usage

```
/morning
```

## What This Does

1. Open work apps (Mail, Calendar, Slack)
2. Display today's calendar events
3. Show unread email count
4. Restore previous window layout (if saved)
5. Optionally start morning playlist

## Implementation

```bash
# Run the morning routine script
./scripts/routines/morning-startup.sh
```

Or execute individual steps:

```bash
# Open apps
open -a "Mail"
open -a "Calendar"
open -a "Slack"

# Get today's events
osascript ./scripts/apps/calendar.scpt today

# Get unread mail count
osascript ./scripts/apps/mail.scpt unread_count

# Restore layout
./scripts/windows/restore-layout.sh default
```

## Display Information

After running, show the user:
- Today's date and day of week
- Number of calendar events today
- Unread email count
- Any reminders due today

## Example Output

```
Good morning! Here's your day:

📅 Friday, February 7, 2026

Calendar:
- 9:00 AM - Team standup
- 2:00 PM - Project review
- 4:30 PM - 1:1 with manager

📧 12 unread emails

Apps launched: Mail, Calendar, Slack
Layout restored: default
```
