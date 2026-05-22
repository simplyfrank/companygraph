# /launch - Quick App Group Launcher

Open a predefined group of apps for a specific context.

## Usage

```
/launch <context>
/launch list          # Show available contexts
```

## Available Contexts

### work
- Mail
- Calendar
- Slack
- Notes

### dev
- Terminal (or iTerm if installed)
- VS Code
- Safari or Chrome
- Docker Desktop (if installed)

### research
- Safari
- Notes
- Preview

### personal
- Messages
- Music
- Photos

## Implementation

```bash
# Launch apps for a context
case "$1" in
  work)
    open -a "Mail"
    open -a "Calendar"
    open -a "Slack"
    open -a "Notes"
    ;;
  dev)
    open -a "Terminal"
    open -a "Visual Studio Code"
    open -a "Safari"
    ;;
  research)
    open -a "Safari"
    open -a "Notes"
    open -a "Preview"
    ;;
  personal)
    open -a "Messages"
    open -a "Music"
    open -a "Photos"
    ;;
esac
```

## Custom Contexts

Additional contexts can be defined in `./config/apps.yaml`.

## After Running

Report which apps were launched and any that failed to open.

## Example Output

```
Launched 'dev' context:
✓ Terminal
✓ Visual Studio Code
✓ Safari
⚠ Docker Desktop (not installed)
```
