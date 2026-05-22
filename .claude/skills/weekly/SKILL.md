# /weekly - Weekly Review

Run a weekly review to clean up, organize, and plan ahead.

## Usage

```
/weekly
```

## What This Does

1. Archive old downloads (files older than 7 days)
2. Clean desktop (move files to organized folders)
3. Show next week's calendar overview
4. Summarize this week's activity
5. Prompt for weekly goals

## Implementation

```bash
# Run the weekly review script
./scripts/routines/weekly-review.sh
```

Or execute individual steps:

```bash
# Archive old downloads
find ~/Downloads -type f -mtime +7 -exec mv {} ~/Downloads/Archive/ \;

# Clean desktop
osascript ./scripts/apps/finder.scpt organize_desktop

# Get next week's calendar
osascript ./scripts/apps/calendar.scpt next_week

# Generate activity summary
./scripts/hooks/session-log.sh weekly-summary
```

## Desktop Organization Rules

Move files from Desktop to:
- `~/Documents/Screenshots/` - Screenshot files
- `~/Documents/Downloads/` - Downloaded files
- `~/Documents/Misc/` - Everything else

## Example Output

```
Weekly Review - Week of Feb 3, 2026

🗂️ Cleanup:
- Archived 23 files from Downloads
- Organized 8 files from Desktop
- Freed up 1.2 GB

📅 Next Week:
- Monday: 3 meetings
- Tuesday: 2 meetings
- Wednesday: 4 meetings
- Thursday: 1 meeting
- Friday: 2 meetings

📊 This Week:
- Total focus time: 18 hours
- Most used apps: VS Code, Safari, Slack
- Sessions: 12

What are your goals for next week?
```
