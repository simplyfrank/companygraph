# /quick - Quick Actions

Execute common quick actions without full commands.

## Usage

```
/quick <action>
/quick list           # Show available actions
```

## Available Actions

### Audio
- `mute` - Mute system audio
- `unmute` - Unmute system audio
- `volume <0-100>` - Set volume level

### Do Not Disturb
- `dnd-on` - Enable Do Not Disturb
- `dnd-off` - Disable Do Not Disturb

### Apps
- `hide-all` - Hide all apps
- `show-all` - Show all hidden apps
- `quit-all` - Quit all apps (with confirmation)

### Windows
- `minimize` - Minimize frontmost window
- `maximize` - Maximize frontmost window
- `center` - Center frontmost window

### System
- `sleep` - Put display to sleep
- `lock` - Lock screen
- `screenshot` - Take screenshot

## Implementation

```bash
case "$1" in
  mute)
    osascript -e 'set volume with output muted'
    ;;
  unmute)
    osascript -e 'set volume without output muted'
    ;;
  volume)
    osascript -e "set volume output volume $2"
    ;;
  dnd-on)
    ./scripts/system/dnd.sh on
    ;;
  dnd-off)
    ./scripts/system/dnd.sh off
    ;;
  hide-all)
    osascript -e 'tell application "System Events" to set visible of every process whose background only is false to false'
    ;;
  sleep)
    pmset displaysleepnow
    ;;
  lock)
    osascript -e 'tell application "System Events" to keystroke "q" using {control down, command down}'
    ;;
  screenshot)
    screencapture -i ~/Desktop/screenshot-$(date +%Y%m%d-%H%M%S).png
    ;;
esac
```

## Example Output

```
✓ Audio muted
```
