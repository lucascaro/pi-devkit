# Pi Input Bell

Rings the terminal bell when Pi finishes a turn and waits for input, or when it opens a user-facing dialog. It is enabled by default and only rings in TUI mode.

## Install

```bash
pi install npm:@lucascaro/pi-input-bell
```

Set `"inputBell": false` in `~/.pi/agent/settings.json` or trusted project `.pi/settings.json` to disable it. Project settings override user settings. Use `/input-bell` to inspect the effective state.

The batteries-included package `@lucascaro/pi-devkit` also includes this extension.
