---
type: added
bump: minor
packages: "@lucascaro/pi-devkit, @lucascaro/pi-guardrails, @lucascaro/pi-input-bell, @lucascaro/pi-model-router, @lucascaro/pi-subagent"
---
- **Make Pi extensions independently installable.** The devkit remains batteries-included, while selected extensions have publishable workspace packages that can be released on their own.
- **Require Pi 0.99.1 or newer for standalone packages.** This avoids affected `undici` versions in earlier Pi releases. Pi 0.99.1 still pins vulnerable `brace-expansion@5.0.9`; the upstream residual is documented in `SECURITY.md`.
- **Apply command safety checks to SDK subagents.** Child sessions block destructive Bash commands even though recursive extension loading is disabled.
