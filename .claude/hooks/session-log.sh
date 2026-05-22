#!/bin/bash
# Log Claude Code session activity
# Usage: ./session-log.sh [start|stop|log <message>|summary]

ACTION="${1:-log}"
MESSAGE="${2:-}"

LOG_DIR="$HOME/.local/share/personalassistant/logs"
TODAY=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/session-$TODAY.log"
STATE_FILE="$LOG_DIR/.session-state"

mkdir -p "$LOG_DIR"

case "$ACTION" in
    start)
        TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
        echo "SESSION_START|$TIMESTAMP" >> "$LOG_FILE"
        echo "$TIMESTAMP" > "$STATE_FILE"
        echo "Session started at $TIMESTAMP"
        ;;

    stop)
        TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
        echo "SESSION_END|$TIMESTAMP" >> "$LOG_FILE"

        # Calculate duration if start time exists
        if [ -f "$STATE_FILE" ]; then
            START_TIME=$(cat "$STATE_FILE")
            START_SEC=$(date -j -f "%Y-%m-%d %H:%M:%S" "$START_TIME" +%s 2>/dev/null)
            END_SEC=$(date +%s)
            if [ -n "$START_SEC" ]; then
                DURATION=$((END_SEC - START_SEC))
                MINUTES=$((DURATION / 60))
                echo "SESSION_DURATION|${MINUTES}m" >> "$LOG_FILE"
                echo "Session ended. Duration: ${MINUTES} minutes"
            fi
            rm -f "$STATE_FILE"
        else
            echo "Session ended at $TIMESTAMP"
        fi
        ;;

    log)
        if [ -n "$MESSAGE" ]; then
            TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
            echo "LOG|$TIMESTAMP|$MESSAGE" >> "$LOG_FILE"
            echo "Logged: $MESSAGE"
        else
            echo "Usage: $0 log <message>"
        fi
        ;;

    summary)
        if [ ! -f "$LOG_FILE" ]; then
            echo "No session data for today"
            exit 0
        fi

        echo "Session summary for $TODAY:"
        echo ""

        # Count sessions
        SESSIONS=$(grep -c "SESSION_START" "$LOG_FILE" 2>/dev/null || echo "0")
        echo "  Sessions: $SESSIONS"

        # Total duration
        TOTAL_MINUTES=$(grep "SESSION_DURATION" "$LOG_FILE" 2>/dev/null | cut -d'|' -f2 | tr -d 'm' | awk '{sum+=$1} END {print sum}')
        echo "  Total time: ${TOTAL_MINUTES:-0} minutes"

        # Log entries
        LOG_ENTRIES=$(grep -c "^LOG|" "$LOG_FILE" 2>/dev/null || echo "0")
        echo "  Log entries: $LOG_ENTRIES"
        ;;

    weekly-summary)
        echo "Weekly session summary:"
        echo ""

        TOTAL_SESSIONS=0
        TOTAL_TIME=0

        for i in {6..0}; do
            DAY=$(date -v-${i}d +%Y-%m-%d)
            DAY_FILE="$LOG_DIR/session-$DAY.log"

            if [ -f "$DAY_FILE" ]; then
                SESSIONS=$(grep -c "SESSION_START" "$DAY_FILE" 2>/dev/null || echo "0")
                MINUTES=$(grep "SESSION_DURATION" "$DAY_FILE" 2>/dev/null | cut -d'|' -f2 | tr -d 'm' | awk '{sum+=$1} END {print sum}')
                TOTAL_SESSIONS=$((TOTAL_SESSIONS + SESSIONS))
                TOTAL_TIME=$((TOTAL_TIME + ${MINUTES:-0}))
            fi
        done

        echo "  Total sessions: $TOTAL_SESSIONS"
        echo "  Total time: $TOTAL_TIME minutes ($(echo "scale=1; $TOTAL_TIME / 60" | bc) hours)"
        ;;

    *)
        echo "Usage: $0 [start|stop|log <message>|summary|weekly-summary]"
        exit 1
        ;;
esac
