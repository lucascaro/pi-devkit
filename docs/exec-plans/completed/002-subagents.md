# Subagent support (hybrid SDK + subprocess)

- **Spec:** — (no product spec; built from an approved in-session plan)
- **Issue:** — (local, no GitHub issue)
- **Status:** completed
- **PR:** — (local)
- **Branch:** — (local)

## Summary

New `subagent` extension: delegate tasks to specialized subagents with isolated
context windows. Each subagent runs with its own context, model, and tool set.

- **Hybrid backends** — in-process SDK (`createAgentSession`, shared
  `ModelRuntime`, default) or isolated subprocess (spawns `pi --mode json`).
  Selected per agent (`backend`/`isolation`) or per task.
- **Three modes** — single (`agent`+`task`), parallel (`tasks[]`, default max 8
  / 4 concurrent), chain (`chain[]` with `{previous}` placeholder).
- **Agent definitions** — YAML (markdown frontmatter + body) or TypeScript
  (dynamic system prompt + init/teardown hooks). Discovered from bundled
  defaults, `~/.pi/agent/agents`, and trusted-project `.pi/agents`.
- **Bundled agents** — `scout`, `planner`, `reviewer`, `worker`.
- **Workflow prompts** — `/implement`, `/scout-and-plan`, `/implement-and-review`.
- **Security** — project-local agents load only in trusted projects
  (`ctx.isProjectTrusted()`), matching pi's existing trust model.

## Research

**Pi has no built-in subagents** (deliberate design — "No sub-agents" in the
README). The repo ships an `examples/extensions/subagent/` prototype that spawns
`pi` subprocesses. This extension supersedes it with a hybrid engine.

**Verified against the installed `@earendil-works/pi-coding-agent@0.85.0`**
(peer dep, public API only):

- `ModelRuntime.create()` — canonical model/auth runtime; shared across SDK
  subagents for one provider/auth resolution.
- `createAgentSession({ modelRuntime, model, thinkingLevel, tools, sessionManager, resourceLoader })`
  — creates an in-process session. `SessionManager.inMemory(cwd)` for ephemeral
  sessions. `session.prompt()`, `session.subscribe()`, `session.dispose()`,
  `session.abort()`.
- `DefaultResourceLoader({ noExtensions, noSkills, noPromptTemplates, noThemes, appendSystemPrompt })`
  — injects the agent's system prompt (appended to the base prompt) while
  disabling extension/skill/prompt/theme loading (avoids loading the subagent
  extension recursively + heavy I/O). Must call `await loader.reload()` when
  providing a custom loader.
- `resolveCliModel({ cliModel, modelRuntime })` — resolves a model string
  (`"haiku"`, `"anthropic/claude-haiku-4-5"`) to a `Model` object.
- `ctx.isProjectTrusted()` — gates project-local resource loading; used to gate
  project-local agent discovery.

**Key constraint discovered:** the local `node_modules` was stale (0.79.6) vs
the lockfile (0.85.0). Ran `npm install` to sync before implementing against the
0.85.0 API (0.79.6 has no `ModelRuntime`).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | Hybrid (SDK default, subprocess fallback) | Best performance + isolation when needed |
| Agent definitions | YAML + TypeScript | Human-readable + typed/dynamic |
| Security | Project-local agents only in trusted projects | Matches pi's existing trust model; safe |
| Session persistence | Ephemeral (`SessionManager.inMemory`) | Fast, clean, no cleanup |
| Scope | Core engine first | Ship a working foundation, iterate |

## Implementation

```
extensions/subagent/
├── index.ts              # Extension entry — registers tool + /subagent-list
├── types.ts              # Shared types + TypeBox schema
├── agents.ts             # Agent discovery (YAML + TS), precedence, trust gate
├── coordinator.ts        # Dispatch (single/parallel/chain), backend selection
├── render.ts             # TUI helpers + renderCall
├── render-result.ts      # renderResult (collapsed/expanded)
├── README.md
├── backends/
│   ├── sdk-backend.ts        # In-process AgentSession backend
│   └── subprocess-backend.ts # Spawn-pi subprocess backend
├── agents/               # Bundled defaults
│   ├── scout.md  planner.md  reviewer.md  worker.md
└── workflows/            # Prompt templates
    ├── implement.md  scout-and-plan.md  implement-and-review.md
```

Tests: `test/extensions/subagent/` — `types.test.ts` (pure functions),
`agents.test.ts` (discovery/precedence/scope), `coordinator.test.ts` (dispatch,
backend selection, chain `{previous}`, parallel limits — with injected mock
backends), `registration.test.ts` (tool + command registration). 35 tests.

## Verification

- `npm run check` — typecheck + validate + 153 tests, all green.
- **SDK backend e2e** — real LLM call via `createAgentSession`; trivial task
  returned the correct answer with correct usage tracking.
- **Subprocess backend e2e** — full flow through pi: main LLM called the
  `subagent` tool → subprocess backend spawned a real `pi` process → subagent
  computed the task → result returned to the main LLM.
- Extension loads in pi without error (`pi -e ./extensions/subagent/index.ts`).

## Deviations from the original plan

- **No `registry.ts` class** — simplified to function-based `agents.ts`
  (`discoverAgents()`), matching the existing example's approach. The
  coordinator calls it per invocation (allows editing agents mid-session).
- **Security simplified** — the original plan sketched a per-agent confirmation
  prompt. Implemented as a project-trust gate instead (project-local agents are
  simply not discovered in untrusted projects). Simpler and safer; relies on
  pi's built-in trust prompt for the "ask once" UX.
- **`validate-prompts.ts` updated** — it hardcoded `prompts/`; now reads all
  `pi.prompts` dirs from the manifest (consistent with `generate-catalog.ts`),
  so the subagent workflow prompts are validated.

## Out of scope (future)

- Cross-agent shared state / memory
- Agent-to-agent messaging
- Dynamic agent creation at runtime
- Cost budgeting / rate limiting
- Visual agent graph in TUI
- Agent versioning / pinning
