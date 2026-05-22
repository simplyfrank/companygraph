# Expense Tracker

Track personal expenses with categories, summaries, and monthly reports.

## Telegram Commands

- `/expense` -- Show expense menu (recent, add, summary, report)
- `/expense add <amount> [category] [description]` -- Quick add
- `/expense summary` -- This month's spending summary
- `/expense report [YYYY-MM]` -- Monthly report with category breakdown

## Categories

food, transport, housing, entertainment, health, shopping, travel, utilities, education, subscriptions, gifts, personal, other

## Data Storage

SQLite table `expenses` in `~/.claude-relay/memory.db`. Auto-created on first use.

## After Running

Show the expense entry and offer to categorize, delete, or view the monthly summary.
