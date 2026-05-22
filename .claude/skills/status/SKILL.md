# /status - System Status Dashboard

Show current system state including running apps, focus mode, and upcoming events.

## Usage

```
/status
```

## What This Shows

1. Currently running apps
2. Active focus mode (if any)
3. Current window layout
4. Upcoming calendar events (next 3)
5. Unread counts (mail, messages)
6. System info (DND status, audio)

## Implementation

```bash
# Get running apps
osascript -e 'tell application "System Events" to get name of every process whose background only is false'

# Check DND status
./scripts/system/dnd.sh status

# Get calendar events
osascript ./scripts/apps/calendar.scpt upcoming 3

# Get unread mail
osascript ./scripts/apps/mail.scpt unread_count

# Get audio status
./scripts/system/audio.sh status
```

## Example Output

```
System Status
═════════════

🖥️ Running Apps:
   Terminal, VS Code, Safari, Slack, Finder

🎯 Focus Mode: deep-work (active for 45 min)

📐 Layout: coding

📅 Upcoming:
   • 2:00 PM - Project review (in 1 hour)
   • 4:30 PM - 1:1 with manager

📧 Unread: 5 emails, 2 messages

🔔 DND: On
🔊 Audio: Muted
```

## Refresh

Run `/status` again to refresh the information.
