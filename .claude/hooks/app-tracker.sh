#!/bin/bash
# Track app usage for productivity insights
# Usage: ./app-tracker.sh [log|summary]

ACTION="${1:-log}"
LOG_DIR="$HOME/.local/share/personalassistant/app-usage"
TODAY=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/$TODAY.log"

mkdir -p "$LOG_DIR"

case "$ACTION" in
    log)
        # Get currently focused app
        FOCUSED_APP=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true' 2>/dev/null)
        TIMESTAMP=$(date "+%H:%M:%S")

        echo "$TIMESTAMP,$FOCUSED_APP" >> "$LOG_FILE"
        ;;

    summary)
        if [ ! -f "$LOG_FILE" ]; then
            echo "No usage data for today"
            exit 0
        fi

        echo "App usage summary for $TODAY:"
        echo ""

        # Count unique apps and their occurrences
        cut -d',' -f2 "$LOG_FILE" | sort | uniq -c | sort -rn | head -10 | while read count app; do
            printf "  %-20s %d entries\n" "$app" "$count"
        done
        ;;

    weekly)
        echo "Weekly app usage:"
        echo ""

        for i in {6..0}; do
            DAY=$(date -v-${i}d +%Y-%m-%d)
            DAY_NAME=$(date -v-${i}d +%A)
            DAY_FILE="$LOG_DIR/$DAY.log"

            if [ -f "$DAY_FILE" ]; then
                ENTRIES=$(wc -l < "$DAY_FILE" | tr -d ' ')
                TOP_APP=$(cut -d',' -f2 "$DAY_FILE" | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')
                printf "  %-10s: %3d entries (top: %s)\n" "$DAY_NAME" "$ENTRIES" "$TOP_APP"
            else
                printf "  %-10s: no data\n" "$DAY_NAME"
            fi
        done
        ;;

    *)
        echo "Usage: $0 [log|summary|weekly]"
        exit 1
        ;;
esac
