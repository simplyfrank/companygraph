#!/bin/bash
# Desktop notification helper
# Usage: ./notify.sh <title> <message> [sound]

TITLE="${1:-Notification}"
MESSAGE="${2:-}"
SOUND="${3:-default}"

# Map sound names to system sounds
case "$SOUND" in
    default) SOUND_NAME="default" ;;
    success) SOUND_NAME="Glass" ;;
    error) SOUND_NAME="Basso" ;;
    warning) SOUND_NAME="Purr" ;;
    ping) SOUND_NAME="Ping" ;;
    *) SOUND_NAME="$SOUND" ;;
esac

# Send notification using osascript
osascript << EOF
display notification "$MESSAGE" with title "$TITLE" sound name "$SOUND_NAME"
EOF

echo "Notification sent: $TITLE"
