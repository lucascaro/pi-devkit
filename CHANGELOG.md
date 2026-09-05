# Changelog

## [Unreleased]

### Added
- **Rings the terminal bell when pi needs your input.** New `input-bell` extension: the bell rings when a turn ends and pi is idle waiting for your next message, and when pi blocks on a dialog (select/confirm/input). Disable with `"inputBell": false` in `~/.pi/agent/settings.json` or the project `.pi/settings.json` (project wins; default on). Check the effective state with `/input-bell`.
