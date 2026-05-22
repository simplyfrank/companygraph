# /telegram - Manage Telegram Bot

Control the Telegram relay bot: start, stop, check status, send messages.

## Usage

```
/telegram [action]
```

Actions: `start`, `stop`, `status`, `send <message>`, `briefing`, `logs`

## Implementation

### Status
```bash
# Check if relay is running
launchctl list | grep com.personal.telegram
# Check process
pgrep -f "relay.ts" && echo "Running" || echo "Stopped"
```

### Start
```bash
cd telegram && bun run start &
# Or via launchd:
launchctl load ~/Library/LaunchAgents/com.personal.telegram-relay.plist
```

### Stop
```bash
launchctl unload ~/Library/LaunchAgents/com.personal.telegram-relay.plist
# Or kill process:
pkill -f "relay.ts"
```

### Send Message
```bash
# Send a message directly via Telegram API
cd telegram && bun -e "
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_USER_ID;
fetch(\`https://api.telegram.org/bot\${token}/sendMessage\`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({chat_id: chatId, text: '$MESSAGE'})
}).then(r => console.log(r.ok ? 'Sent' : 'Failed'));
"
```

### Send Morning Briefing
```bash
cd telegram && bun run briefing
```

### View Logs
```bash
tail -50 ~/Library/Logs/personal-telegram-relay.log
```

## Example Output

```
Telegram Bot Status
═══════════════════

Bot: Running (PID 12345)
Uptime: 3 hours
Last message: 15 min ago
Memory: 2 facts, 3 goals stored
Daemon: loaded (com.personal.telegram-relay)
```
