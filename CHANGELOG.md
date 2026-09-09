# Changelog

## [Unreleased]

### Added
- **Delegate tasks to specialized subagents with isolated context.** New `subagent` extension: run single, parallel, or chained subagents, each with its own context window, model, and tool set. Hybrid backends — in-process SDK (default, fast) or isolated subprocess — selectable per agent or per task. Agents are defined as YAML (markdown) or TypeScript, discovered from bundled defaults, `~/.pi/agent/agents`, and trusted-project `.pi/agents`. Ships `scout`/`planner`/`reviewer`/`worker` agents plus `/implement`, `/scout-and-plan`, and `/implement-and-review` workflow prompts. List agents with `/subagent-list`.
- **Rings the terminal bell when pi needs your input.** New `input-bell` extension: the bell rings when a turn ends and pi is idle waiting for your next message, and when pi blocks on a dialog (select/confirm/input). Disable with `"inputBell": false` in `~/.pi/agent/settings.json` or the project `.pi/settings.json` (project wins; default on). Check the effective state with `/input-bell`.
