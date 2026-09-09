# Subagent Extension

Delegate tasks to specialized subagents with isolated context windows. Each
subagent runs with its own context, model, and tool set, so it doesn't pollute
the main conversation.

## Backends

| Backend | How it works | When to use |
|---------|--------------|-------------|
| `sdk` (default) | In-process `AgentSession` sharing one `ModelRuntime` | Fastest dispatch, lower latency. Best for most tasks. |
| `subprocess` | Spawns a separate `pi` process | Full process isolation, crash isolation, independent model/auth. |

An agent's backend is chosen by this priority:
1. `isolation: process` in the agent definition → always `subprocess`
2. Per-task `backend` override
3. `backend` in the agent definition
4. The coordinator default (`sdk`)

## Modes

- **Single** — `{ agent, task }`: one agent, one task.
- **Parallel** — `{ tasks: [{ agent, task }, ...] }`: run concurrently (default max 8 tasks, 4 concurrent).
- **Chain** — `{ chain: [{ agent, task }, ...] }`: run sequentially; use `{previous}` in a task to inject the prior step's output.

## Agents

Agents are defined as markdown files (YAML frontmatter + system prompt body) or
TypeScript modules. Discovered from, in precedence order (later overrides
earlier on name conflict):

1. Bundled defaults — `extensions/subagent/agents/` (ships with the package)
2. User-level — `~/.pi/agent/agents/`
3. Project-local — `.pi/agents/` (only in trusted projects)

### YAML agent

```markdown
---
name: my-agent
description: What this agent does
tools: read, grep, find, ls
model: router:low
backend: sdk            # optional: sdk | subprocess
isolation: process      # optional: none | session | process (process forces subprocess)
---

System prompt for the agent goes here.
```

**Model resolution:**

- `model: router:low` — resolves against the router config's first profile (uses the model from the `low` tier)
- `model: router:default:high` — resolves against the `default` profile's `high` tier
- `model: claude-haiku-4-5` — concrete model, resolved via `resolveCliModel`
- omit `model` entirely — inherits the dispatching session's active model and thinking level

### TypeScript agent (dynamic)

```typescript
// ~/.pi/agent/agents/code-review.ts
export const codeReview = {
  name: "code-review",
  description: "Reviews code with project-specific guidelines",
  systemPrompt: async (ctx) => `Review against these rules:\n${await loadRules(ctx.cwd)}`,
  // optional lifecycle hooks:
  // init: async (ctx) => { ... },
  // teardown: async (ctx) => { ... },
};
```

## Bundled agents

| Agent | Purpose | Model | Tools |
|-------|---------|-------|-------|
| `scout` | Fast codebase recon, returns compressed context | `router:low` | read, grep, find, ls, bash |
| `planner` | Creates implementation plans (read-only) | `router:high` | read, grep, find, ls |
| `reviewer` | Code review for quality and security | `router:high` | read, grep, find, ls, bash |
| `worker` | General-purpose, full capabilities | `router:medium` | (all default) |

Override any of them by creating an agent with the same name in
`~/.pi/agent/agents/` or `.pi/agents/`.

## Workflow prompts

- `/implement <query>` — scout → planner → worker
- `/scout-and-plan <query>` — scout → planner (no implementation)
- `/implement-and-review <query>` — worker → reviewer → worker

## Commands

- `/subagent-list` — list available subagents

## Security

- **Project-local agents** (`.pi/agents/`) are only loaded in **trusted**
  projects. In an untrusted project, requesting `agentScope: "project"` or
  `"both"` falls back to user-level agents with a note explaining why.
- The `subprocess` backend runs each subagent in a separate process with its
  own tool sandbox; use `isolation: process` for agents that should never run
  in-process.
- Subagents inherit the parent session's model auth. They run with your system
  permissions — review agent definitions before installing packages that ship
  them.

## Usage examples

```
Use scout to find all authentication code
Run 2 scouts in parallel: one to find models, one to find providers
Use a chain: scout finds the read tool, then planner suggests improvements
```

## Limitations

- Collapsed TUI view shows the last ~10 items (Ctrl+O to expand).
- Parallel model-visible output is capped per task (default 50 KB); full output
  is preserved in tool details.
- Agents are re-discovered on each invocation (allows editing mid-session).
