# /evening - Evening Cleanup Routine

End your day with a consistent routine that saves state and closes apps.

## Usage

```
/evening
```

## What This Does

1. Save current window layout
2. Offer to close browser tabs (with bookmark option)
3. Quit communication apps
4. Show daily summary (apps used, focus time)
5. Prompt for tomorrow's top priorities

## Implementation

```bash
# Run the evening routine script
./scripts/routines/evening-cleanup.sh
```

Or execute individual steps:

```bash
# Save current layout
./scripts/windows/save-layout.sh evening-save

# Close communication apps
osascript -e 'tell application "Slack" to quit'
osascript -e 'tell application "Mail" to quit'
osascript -e 'tell application "Messages" to quit'

# Optional: close browser tabs
osascript ./scripts/apps/safari.scpt close_all_tabs
```

## Interactive Steps

Ask the user before:
- Closing browser tabs (offer to save as bookmarks)
- Quitting apps with unsaved work

## Example Output

```
Evening cleanup complete!

📊 Today's summary:
- Active apps: VS Code (4h), Safari (2h), Slack (1.5h)
- Focus sessions: 2 (total 3 hours)

💾 Saved: window layout, open tabs list

🚪 Closed: Slack, Mail, Messages

What are your top 3 priorities for tomorrow?
```
