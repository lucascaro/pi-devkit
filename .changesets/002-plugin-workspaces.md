---
type: added
bump: minor
packages: "@lucascaro/pi-devkit, @lucascaro/pi-guardrails, @lucascaro/pi-input-bell, @lucascaro/pi-model-router, @lucascaro/pi-subagent"
---
- **Make Pi extensions independently installable.** The devkit remains batteries-included, while selected extensions have publishable workspace packages that can be released on their own.
- **Apply command safety checks to SDK subagents.** Child sessions block destructive Bash commands even though recursive extension loading is disabled.
