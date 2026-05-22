# /debug-cloud - Debug Cloud Bot

Diagnose and monitor the EC2 cloud bot.

## Usage

- `/debug-cloud` — Full health check
- `/debug-cloud logs` — Recent logs
- `/debug-cloud agent` — Agent connection status
- `/debug-cloud scheduler` — Scheduler job status

## SSH Access

```bash
EC2_HOST="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw public_ip)"
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}"
```

## Quick Health Check

```bash
EC2_HOST="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw public_ip)"

# Service status
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'sudo systemctl status assistant-bot --no-pager'

# Recent logs (last 50 lines)
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'sudo journalctl -u assistant-bot -n 50 --no-pager'

# Health endpoint
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'curl -s http://localhost:8080/'
```

## Log Patterns to Watch

### Healthy
```
Bot started (long polling)
Agent server listening on :8080
[Fallback] CLI: available, API: key missing → cli
Agent connected
```

### Problems
```
409 Conflict               → Another bot instance running. Wait RestartSec=35s.
ECONNREFUSED               → Agent server not starting (port conflict?)
Agent heartbeat timeout     → Local laptop disconnected (normal if laptop closed)
Claude CLI failed           → Check credentials: ~/.claude/.credentials.json
[Scheduler] ... error       → Job failure (check specific job)
```

## Memory Database Inspection

```bash
EC2_HOST="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw public_ip)"

# On EC2
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'sqlite3 ~/.claude-relay/memory.db "SELECT job_name, last_run_at, run_count FROM scheduler_jobs ORDER BY last_run_at DESC LIMIT 10;"'

# Facts
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'sqlite3 ~/.claude-relay/memory.db "SELECT id, substr(text, 1, 80) FROM facts ORDER BY id DESC LIMIT 10;"'

# Recent prompt logs
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'sqlite3 ~/.claude-relay/memory.db "SELECT ts, source, model, duration_ms, substr(user_preview, 1, 60) FROM prompt_logs ORDER BY ts DESC LIMIT 10;"'
```

## Common Fixes

### Restart Service
```bash
EC2_HOST="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw public_ip)"
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'sudo systemctl restart assistant-bot'
```

### Update Dependencies
```bash
EC2_HOST="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw public_ip)"
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'cd ~/app && bun install'
```

### Refresh Secrets
```bash
# Restart pulls fresh secrets from AWS Secrets Manager
EC2_HOST="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw public_ip)"
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'sudo systemctl restart assistant-bot'
```

### Check Claude CLI
```bash
EC2_HOST="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw public_ip)"
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'claude --version && claude -p "test" --output-format text --max-turns 1 2>&1 | head -5'
```

## Process Resources
```bash
EC2_HOST="$(terraform -chdir /Users/frank/Documents/coding/personalassistant/terraform output -raw public_ip)"
ssh -i ~/.ssh/personal-assistant.pem "ec2-user@${EC2_HOST}" 'ps aux | grep bun; free -h; df -h /'
```
