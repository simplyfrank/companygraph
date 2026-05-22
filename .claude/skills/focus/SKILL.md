# /focus - Enable Focus Mode

Enable deep work mode to minimize distractions.

## Usage

```
/focus [profile]
```

## Profiles

- `deep-work` (default) - Maximum focus, all distractions hidden
- `meetings` - Keep calendar and communication visible
- `reading` - Minimal interface, all apps hidden
- `creative` - Hide communication but keep music

## What This Does

1. Enable Do Not Disturb
2. Hide distracting apps (Mail, Slack, Messages, social media)
3. Set Slack status to "Focusing" (if Slack is running)
4. Optionally mute system audio
5. Log focus session start

## Implementation

Run these commands in sequence:

```bash
# Enable DND
./scripts/system/dnd.sh on

# Hide distracting apps based on profile
osascript ./scripts/apps/common.scpt hide_apps "Mail,Slack,Messages"

# Set Slack status if running
osascript -e 'tell application "System Events" to if exists process "Slack" then tell application "Slack" to activate'
```

## Profile-Specific Actions

### deep-work
```bash
./scripts/system/dnd.sh on
osascript ./scripts/apps/common.scpt hide_apps "Mail,Slack,Messages,Safari,Chrome"
```

### meetings
```bash
./scripts/system/dnd.sh off
osascript ./scripts/apps/common.scpt show_apps "Calendar,Slack,Notes"
osascript ./scripts/apps/common.scpt hide_apps "Mail,Messages"
```

### reading
```bash
./scripts/system/dnd.sh on
./scripts/system/audio.sh mute
osascript ./scripts/apps/common.scpt hide_all_except "Preview,Safari"
```

### creative
```bash
./scripts/system/dnd.sh on
osascript ./scripts/apps/common.scpt hide_apps "Mail,Slack,Messages"
osascript ./scripts/apps/common.scpt show_apps "Music"
```

## After Running

Notify the user:
- Which profile is active
- Which apps were hidden
- How to exit focus mode (`/unfocus`)
