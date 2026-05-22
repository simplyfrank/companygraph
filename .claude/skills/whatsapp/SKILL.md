---
name: WhatsApp Business Manager
description: Send WhatsApp messages, manage contacts, and use message templates via WhatsApp Business API
category: app
triggers: ["/whatsapp", "whatsapp", "send whatsapp"]
requires: []
---

# WhatsApp Business Manager

Manage WhatsApp Business messaging through the assistant. Send messages to saved contacts, use templates for common responses, and maintain a contact directory.

## Core Commands

### `/whatsapp` — Show status & help
Displays WhatsApp Business configuration status, number of saved contacts and templates, and command list.

### `/whatsapp send <contact> | <message>` — Send message
Send a text message to a saved contact.
- Example: `/whatsapp send John | Hey, are we still on for lunch?`
- Logs sent messages for tracking

### `/whatsapp template <contact> | <template>` — Send template
Send a pre-saved message template to a contact.
- Example: `/whatsapp template Sarah | meeting-confirmation`
- Useful for common responses (follow-ups, status updates, meeting confirmations)

## Contact Management

### `/whatsapp contacts` — List all contacts
Shows all saved WhatsApp contacts with their phone numbers and labels.

### `/whatsapp add <name> | <phone> [| label]` — Add contact
Save a new contact with optional label for categorization.
- Example: `/whatsapp add John Smith | +6512345678 | client`
- Labels: client, vendor, personal, etc.

## Template Management

### `/whatsapp templates` — List all templates
Shows all saved message templates with preview.

### `/whatsapp save <name> | <body> [| category]` — Save template
Create a reusable message template.
- Example: `/whatsapp save meeting-confirm | Thanks for scheduling. I'll see you at {{time}}. | business`
- Categories: business, personal, follow-up, status-update

## Storage

All WhatsApp data is stored in `~/.claude-relay/memory.db`:
- **whatsapp_contacts**: Contact directory
- **whatsapp_templates**: Message templates
- **whatsapp_sent**: Sent message log (for tracking and reference)

## Configuration

Requires environment variables on cloud server:
- `WHATSAPP_TOKEN` — WhatsApp Business API access token
- `WHATSAPP_PHONE_ID` — WhatsApp Business phone number ID
- `WHATSAPP_BUSINESS_ID` — Meta Business account ID

## Use Cases

1. **Quick Client Communication**: Save common messages as templates, send with one command
2. **Meeting Coordination**: Send meeting confirmations, reminders, updates
3. **Follow-ups**: Template-based follow-up messages after meetings/calls
4. **Status Updates**: Send project status updates to clients/vendors
5. **Personal Messages**: Quick messages to family/friends without opening WhatsApp

## Integration Notes

- Uses WhatsApp Cloud API (requires Meta Business Manager account)
- Webhook configured for incoming messages (relayed to Telegram)
- All outbound messages logged for tracking
- Contact labels enable categorization (broadcast lists, filters)
- Templates can include variables for personalization

## Examples

```bash
# Add a client contact
/whatsapp add Jane Doe | +6591234567 | client

# Send a quick message
/whatsapp send Jane Doe | Hi Jane, following up on our meeting today. Could you send the documents by Friday?

# Save a template for common follow-ups
/whatsapp save follow-up | Thanks for the meeting! I'll send over the proposal by {{date}}. Let me know if you have questions. | business

# Send template
/whatsapp template Jane Doe | follow-up

# List all contacts
/whatsapp contacts

# Check status
/whatsapp
```
