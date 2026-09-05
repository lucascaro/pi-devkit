---
title: Ring terminal bell when input is needed
type: enhancement
complexity: S
priority: P1
pr: 2
stage: REVIEW
---

# Ring terminal bell when input is needed

- **Exec plan:** [docs/exec-plans/active/001-ring-terminal-bell-for-input.md](../exec-plans/active/001-ring-terminal-bell-for-input.md)

## Problem

When pi is waiting for operator input (a question, an approval, a confirmation), there is no audible or visible-out-of-focus signal. If the terminal is not the active window, the operator keeps working elsewhere until they happen to look back. Long autonomous runs make this worse: the loop can sit at a stop for minutes with no indication it is blocked.

## Desired behavior

Pi rings the terminal bell (and ideally a visible cue) whenever it reaches a state where it needs the operator's input, so the operator can return to the terminal from another window or app.

## Success criteria

- In TUI mode, when an agent turn ends and pi is idle, a BEL (`\x07`) is written to stdout — the terminal bell rings.
- In TUI mode, when pi blocks on a UI dialog (select/confirm/input/editor/custom), a BEL is written to stdout.
- `"inputBell": false` in `~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project, trusted projects only) disables the bell; absent key means on; project overrides global.
- No BEL is written in print/JSON/RPC modes, and none at session start before the first turn.

## Non-goals

- No visual cue (no notify banner or status-line change) — bell only.
- No sound customization (patterns, volume, custom sounds) — a single BEL.
- Built-in pi TUI dialogs that do not go through the extension UI (e.g. the startup project-trust prompt) are not covered.
- No changes to pi itself — this ships as a pi-devkit extension, not an upstream pi change.

## Notes

Local spec — no GitHub issue (project policy `opt-in`).
