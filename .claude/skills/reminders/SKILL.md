# Reminders - Apple Reminders CRUD

Manage Apple Reminders: create, complete, delete, search, and list reminders.

## Usage

```bash
osascript ./scripts/apps/reminders-crud.scpt <command> [args...]
```

## Commands

- `list` -- Show all reminder lists (with incomplete counts)
- `list_items <listName>` -- Show incomplete items in a list
- `due_today` -- Reminders due today (across all lists)
- `overdue` -- Overdue reminders (across all lists)
- `create <list> <title> [dueDate] [priority] [notes]` -- Create a reminder
  - dueDate: ISO format `2026-02-08T14:30`
  - priority: 1 (high) to 5 (low), 0 = none
  - notes: free text
- `complete <title>` -- Mark a reminder as completed (fuzzy name match)
- `delete <title>` -- Delete a reminder (fuzzy name match)
- `search <query>` -- Search incomplete reminders by name across all lists

## Examples

```bash
# List all reminder lists
osascript ./scripts/apps/reminders-crud.scpt list

# Show items in a specific list
osascript ./scripts/apps/reminders-crud.scpt list_items "Groceries"

# Create a reminder with due date and priority
osascript ./scripts/apps/reminders-crud.scpt create "Work" "Finish report" "2026-02-10T17:00" 1 "Q4 summary"

# Complete a reminder by name
osascript ./scripts/apps/reminders-crud.scpt complete "Finish report"

# See what is due today
osascript ./scripts/apps/reminders-crud.scpt due_today

# Search for reminders
osascript ./scripts/apps/reminders-crud.scpt search "report"
```

## After Running

Show results to user, offer follow-up actions (e.g., complete, reschedule, create related reminders).
