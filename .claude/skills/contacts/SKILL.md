# Contacts - Apple Contacts Search

Search and browse Apple Contacts from macOS.

## Usage

```bash
osascript ./scripts/apps/contacts.scpt <command> [args...]
```

## Commands

- `search <query>` -- Search contacts by name, email, or phone
- `get <name>` -- Get full details for a specific contact
- `list_groups` -- List all contact groups
- `list [group]` -- List contacts (optionally filtered by group)
- `birthdays [days]` -- Upcoming birthdays (default: 30 days)

## Examples

```bash
# Search for a contact
osascript ./scripts/apps/contacts.scpt search "John"

# Get full contact details
osascript ./scripts/apps/contacts.scpt get "John Smith"

# Upcoming birthdays in the next 14 days
osascript ./scripts/apps/contacts.scpt birthdays 14
```

## After Running

Show contact details and offer to compose email, call, or message.
