# Changelog

## [Unreleased]

### Added
- **Rings the terminal bell when pi needs your input.** New `input-bell` extension: the bell rings when a turn ends and pi is idle waiting for your next message, and when pi blocks on a dialog (select/confirm/input). Disable with `"inputBell": false` in `~/.pi/agent/settings.json` or the project `.pi/settings.json` (project wins; default on). Check the effective state with `/input-bell`.
- **Make Pi extensions independently installable.** The devkit remains batteries-included, while selected extensions have publishable workspace packages that can be released on their own.
- **Require Pi 0.99.1 or newer for standalone packages.** This avoids affected `undici` versions in earlier Pi releases. Pi 0.99.1 still pins vulnerable `brace-expansion@5.0.9`; the upstream residual is documented in `SECURITY.md`.
- **Apply command safety checks to SDK subagents.** Child sessions block destructive Bash commands even though recursive extension loading is disabled.
