# /layout - Window Layout Management

Apply predefined window arrangements or save/restore custom layouts.

## Usage

```
/layout <name>          # Apply a layout
/layout save <name>     # Save current window positions
/layout list            # Show available layouts
```

## Available Layouts

### coding
- Terminal: left 50%
- VS Code: right 50%

### research
- Safari/Chrome: left 70%
- Notes: right 30%

### communication
- Slack: left 50%
- Mail: right 50%

### writing
- Frontmost app: centered, 70% width, 90% height

## Implementation

### Apply Layout

```bash
./scripts/windows/restore-layout.sh <layout-name>
```

Or use AppleScript directly:

```applescript
-- coding layout example
tell application "System Events"
    set screenWidth to (do shell script "system_profiler SPDisplaysDataType | grep Resolution | head -1 | awk '{print $2}'") as number
    set screenHeight to (do shell script "system_profiler SPDisplaysDataType | grep Resolution | head -1 | awk '{print $4}'") as number
end tell

tell application "Terminal"
    activate
    set bounds of front window to {0, 25, screenWidth / 2, screenHeight}
end tell

tell application "Code"
    activate
    set bounds of front window to {screenWidth / 2, 25, screenWidth, screenHeight}
end tell
```

### Save Layout

```bash
./scripts/windows/save-layout.sh <layout-name>
```

### List Layouts

```bash
ls ./scripts/windows/layouts/ 2>/dev/null || cat ./config/layouts.yaml
```

## Layout Definitions

Layouts are defined in `./config/layouts.yaml` with window positions as percentages of screen size.

## After Running

Report which apps were positioned and their new locations.
