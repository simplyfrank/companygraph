# /unfocus - Disable Focus Mode

Restore normal working state after a focus session.

## Usage

```
/unfocus
```

## What This Does

1. Disable Do Not Disturb
2. Unhide previously hidden apps
3. Clear Slack "Focusing" status
4. Restore audio if muted
5. Log focus session end

## Implementation

```bash
# Disable DND
./scripts/system/dnd.sh off

# Show hidden apps
osascript ./scripts/apps/common.scpt show_apps "Mail,Slack,Messages"

# Restore audio
./scripts/system/audio.sh unmute
```

## After Running

Notify the user:
- Focus session ended
- Duration of focus session (if tracked)
- Apps restored to visible state
