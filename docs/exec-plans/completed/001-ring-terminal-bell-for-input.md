# Ring terminal bell when input is needed

- **Spec:** [docs/product-specs/001-ring-terminal-bell-for-input.md](../../product-specs/001-ring-terminal-bell-for-input.md)
- **Issue:** — (local spec, no GitHub issue)
- **Status:** completed
- **PR:** #2
- **Branch:** feature/001-ring-terminal-bell-for-input

<!--
Stage is **not** carried here. The spec's YAML frontmatter `stage:` is the
sole source of truth. Skills read and write stage from the spec — never from
this file or the generated `docs/product-specs/index.md`.
-->

## Summary

New `input-bell` extension: rings the terminal bell (BEL to stdout) when pi needs operator input — when a turn ends and pi is idle, and when pi blocks on a UI dialog. Controlled by an `inputBell` settings key (default on), read from project `.pi/settings.json` (trusted projects only) with global `~/.pi/agent/settings.json` fallback.

## Research

**Pi extension API surface** (read from the installed `@earendil-works/pi-coding-agent` package — peer dep, public API only):

- `agent_settled` event (`dist/core/extensions/types.d.ts:560`) — "Fired after an agent run has fully settled and no automatic retry, compaction, or queued continuation will run." Emitted only after a real run (`agent-session.js:773` sets run-active, `:784` emits settled) — so it never fires at session start before the first turn. No false startup bell.
- `ui_prompt_start` event (`types.d.ts:566`) — fires around every `ctx.ui` dialog method (`select`/`confirm`/`input`/`editor`/`custom`); the runner wraps all five (`runner.js:266-300`). Nested/overlapping prompts coalesce into one outer span (`uiPromptDepth`), so no double-bell.
- `ctx.mode` — `"tui" | "rpc" | "json" | "print"`. Bell must be guarded by `ctx.mode === "tui"`: in RPC/print/JSON, stdout is a data channel and a BEL byte would corrupt output.
- `ctx.isIdle()` — available in handlers; in `agent_settled` it is true "unless another extension started a new run". Check it to skip the bell when pi is about to keep running on its own.
- `getAgentDir()` and `CONFIG_DIR_NAME` are exported from the package root (`dist/index.d.ts:2`) — used to locate `~/.pi/agent/settings.json` (global) and `.pi/settings.json` (project).
- Settings mechanics (`dist/core/settings-manager.js`): `deepMergeSettings(global, project)` — project overrides global; unknown keys are tolerated (plain `JSON.parse`, per-key getters); project settings are only loaded for trusted projects (`loadFromStorage` returns `{}` when untrusted). Our direct file read must mirror the trust check via `ctx.isProjectTrusted()`.
- Bell mechanism: pi-tui's `ProcessTerminal` writes raw escape sequences straight to `process.stdout` (`pi-tui/dist/terminal.js:362-364`, incl. the OSC title sequence ending in `\x07` at `:407`). A lone `\x07` (BEL) passes through to the terminal emulator and rings the bell — safe, no screen corruption.

**Repo patterns:**

- Extension shape: single `extensions/<name>/index.ts` with `export default function (pi: ExtensionAPI)` — see `extensions/guardrails/index.ts` (26 lines).
- `scripts/validate-extensions.ts` requires `index.ts` + default export + `pi`-named param; nothing else.
- `scripts/generate-catalog.ts` reads the first top-level `description:` string in each extension source for `docs/catalog.md` — a `registerCommand` with a description feeds it. Regenerate via `npm run generate:catalog`.
- `README.md` Contents list (lines 25-27) — add an entry there.
- Tests: vitest with a `vi.fn()`-mocked `ExtensionAPI` — see `test/extensions/registration.test.ts`.

**Constraints / dependencies:**

- pi is a peer dependency (`*`); the extension uses only documented public API (events, `ctx`, `getAgentDir`, `CONFIG_DIR_NAME`).
- Project settings honored only for trusted projects — matches pi's trust model; no extra plumbing.
- No public "user is typing" signal exists, so a turn-end bell while the operator is already typing in the editor is a known minor annoyance (same behavior as Claude Code's notification hooks). Accepted.

**Prior lessons:** none matched (fresh brain).

## Approach

Single new extension, `extensions/input-bell/index.ts` (~70 lines), four parts:

1. **Signal detection** — two event handlers:
   - `agent_settled`: ring when `ctx.isIdle()` (skip if another extension already started a new run). This is pi's documented "will not continue automatically" event; it only fires after a real run, so no bell at session start.
   - `ui_prompt_start`: ring when pi blocks on any `ctx.ui` dialog (select/confirm/input/editor/custom). Pi coalesces nested prompts into one span → no double-bell.
2. **Bell** — `process.stdout.write("\x07")` (BEL), guarded by `ctx.mode === "tui"`, wrapped in try/catch so a bell failure can never crash the session. pi-tui itself writes raw escape sequences to stdout, so a lone BEL passes through to the terminal emulator.
3. **Setting** — `inputBell` boolean, default `true`. Read fresh on every event (two small JSON files, no staleness): global `~/.pi/agent/settings.json` (via exported `getAgentDir()`), then project `.pi/settings.json` (via `join(ctx.cwd, CONFIG_DIR_NAME)`) — project consulted only when `ctx.isProjectTrusted()`. Project overrides global. Missing file / invalid JSON / non-boolean value → keep current value (default on).
4. **Status command** — `/input-bell` reports the effective setting (diagnostic; also feeds the auto-generated catalog, same as `guardrails`).

**Why this beats the obvious alternatives:**

- Ringing on `turn_end` would be wrong: a turn can end while queued follow-ups are about to run. `agent_settled` is the true "waiting on you" event.
- Reading the setting once at `session_start` goes stale if the operator edits settings mid-session; per-event reads are two tiny files, negligible cost.
- A separate `.pi/input-bell.json` config file was ruled out in favor of pi's own settings.json (operator choice at clarifying round A).

### Files to change

- `README.md` — add `extensions/input-bell` to the Contents list.
- `AGENTS.md` — add `input-bell` to the module map's extensions list.
- `docs/catalog.md` — regenerate via `npm run generate:catalog` (auto-generated; the CI `verify-generated` job diffs it).
- `test/extensions/registration.test.ts` — add input-bell registration assertion.

### New files

- `extensions/input-bell/index.ts` — the extension (handlers + setting reader + status command).
- `test/extensions/input-bell.test.ts` — behavioral tests.
- `.changesets/001-input-bell.md` — per-PR changeset (user-visible change).

`package.json` needs no change — the `./extensions` directory is scanned automatically by pi and by `validate-extensions.ts`.

### Tests

All in `test/extensions/input-bell.test.ts` (vitest). Harness: `vi.fn()`-mocked `ExtensionAPI` capturing registered handlers; `vi.spyOn(process.stdout, "write")` to assert BEL bytes; `vi.mock("@earendil-works/pi-coding-agent")` with `importOriginal` redirecting `getAgentDir()` to a temp dir. The extension calls `process.stdout.write` directly at ring time (no module-level capture) so the spy catches it.

- `rings the bell on agent_settled when idle in tui mode` — SC1, turn-end bell.
- `does not ring on agent_settled when another run is active` — `isIdle()` guard.
- `does not ring in non-tui modes` (print/json/rpc) — SC4, no BEL on data channels.
- `rings the bell on ui_prompt_start in tui mode` — SC2, dialog bell.
- `does not ring on ui_prompt_start in non-tui modes` — SC4.
- `respects inputBell false from global settings` — SC3, global off.
- `project settings override global (both directions)` — SC3, precedence.
- `ignores project settings when project is not trusted` — SC3, trust model.
- `defaults to on when settings are absent or invalid` — SC3, default + resilience.
- `registers the input-bell status command` — registration.

Each test fails on the corresponding broken implementation (missing mode guard, default-off, no override, no trust check, no isIdle check, wrong event name).

## Verification

```bash
npm run generate:catalog   # regenerate docs/catalog.md
npm run check              # typecheck + validate + test (AGENTS.md)

# Manual TUI smoke test:
pi -e ./extensions/input-bell/index.ts
# 1. send a message; when the turn ends -> bell rings
# 2. with guardrails loaded, run a dangerous bash command -> confirm dialog -> bell rings
# 3. set "inputBell": false in ~/.pi/agent/settings.json; restart pi -> no bell
```

## Second opinion

**verdict: approve — confidence 8/10**

**Disclosure:** this runtime has no subagent tool, so the reviewer subagent could not be dispatched. The orchestrator ran the reviewer checklist inline instead — same four checks, cited against the installed pi package source.

- **Success-criteria coverage:** all four SCs mapped to handlers/tests; no non-goal bleed (no visual cue on the bell path; the `/input-bell` command only notifies when explicitly invoked).
- **Verification realness:** `npm run check` and `generate:catalog` are real package scripts; each named test fails on its corresponding broken implementation — no vacuous assertions. Residual gap: unit tests assert the BEL byte on `process.stdout.write`; only the manual TUI step proves the terminal actually rings (terminal-emulator behavior, out of code scope).
- **Blast radius:** review caught a missed `AGENTS.md` module-map entry — added to Files. `package.json` confirmed unchanged (directory scan). Changeset format follows `.changesets/README.md`.
- **Design holes:** no awaits in the bell path (no deadlock); bell write wrapped in try/catch so EPIPE cannot crash the session; per-event setting reads avoid staleness; nested-prompt coalescing is pi-side, so no double-bell.

## Open questions

- Terminal emulators map BEL to a visual flash instead of sound (iTerm2/Alacritty/kitty setting) — out of scope; the operator's terminal decides.
- Turn-end bell while the operator is already typing in the editor = minor noise; pi exposes no "user is typing" signal. Accepted — same behavior as Claude Code's notification hooks.
- A prompt bell and a later settle bell are two distinct input-waits (answer the dialog → then the next message) — intentional, not a double-bell.
- Ruled out: env-var override (`PI_INPUT_BELL=0`) for one-off silencing — the setting covers it; revisit if needed.

## Decision log

- **2026-09-04** — Clarifying round A: ring on both `agent_settled` (idle) and `ui_prompt_start`; bell only, no visual cue; pi setting `inputBell` default-on with per-project override. Why: operator answers at plan intake.
- **2026-09-04** — Plan approved via plan-html with empty feedback. Second opinion ran inline (no subagent tool in this runtime); disclosed in the plan.
- **2026-09-04** — Bumped pi dev stack 0.79.6 → 0.85.0 (lockfile was stale; package.json already declared `latest`). Why: the feature requires `ui_prompt_start` (pi ≥ 0.84.4) and the stale lock made the new event types unavailable.
- **2026-09-04** — Set peerDep floor `@earendil-works/pi-coding-agent: >=0.84.4`. Why: the extension imports `CONFIG_DIR_NAME` (≥0.79.7), uses `agent_settled` (≥0.80.4) and `ui_prompt_start` (≥0.84.4); older pi would fail at extension load.
- **2026-09-04** — model-router: `streamSimple` now imported from `@earendil-works/pi-ai/compat` (no longer in the pi-ai main entry), and `"max"` added to `THINKING_LEVELS` (pi-agent-core 0.85 added `"max"` to `ThinkingLevel`). Why: the pi bump surfaced a latent break — a fresh `npm install` on the old lock would have failed typecheck regardless of this feature.
- **2026-09-04** — Added `@earendil-works/pi-server` as a devDependency. Why: pi-coding-agent 0.85.0's library entry (`dist/index.js` → `main.js` → `experimental/server.js`) imports it but does not declare it; the bundled CLI never hits this. Upstream packaging bug — file an issue with earendil-works.

## Progress

- **2026-09-04** — Spec created (local, no GitHub issue), triaged as enhancement/S/P1.
- **2026-09-04** — Implemented: extension, 10 behavioral tests, registration test, changeset, README/AGENTS/catalog updates, pi stack bump + model-router compat fixes. `npm run check` green (112 tests).
- **2026-09-04** — Pushed `feature/001-ring-terminal-bell-for-input`, opened PR #2 (no GitHub issue — local spec).
- **2026-09-04** — Review converged iter 1 (APPROVE, 0 findings, 0 open threads, CI green). Stage → GATE.

## PR convergence ledger

- **2026-09-04 iter 1** — verdict: APPROVE; mergeable: MERGEABLE; findings_hash: (empty); threads_open: 0; action: stop; head_sha: 9b48824. Note: review-loop worker subagents unavailable in this runtime — review-pr checklists + CI verification ran inline in the orchestrator; disclosed here and in the Second opinion section.

## Gate verdict

- **2026-09-04** — verdict: PASS; checks: 12 passed / 0 failed / 0 followups; followups: none; one-line: all 4 success criteria evidenced by passing tests + code, all 4 non-goals verified, docs (README/changeset/catalog/AGENTS) accurate.
  - 2026-09-04 dimensions:
    - acceptance — PASS — SC1 turn-end bell: `agent_settled`+`isIdle()` handler (index.ts:57-61), test passes; SC2 dialog bell: `ui_prompt_start` handler (index.ts:64-66), test passes; SC3 setting: global/project/trust/default reader (index.ts:18-38), 4 tests pass; SC4 no BEL in print/JSON/RPC + no startup bell: mode guard (index.ts:48) tested for 3 modes; `agent_settled` fires only after a real run (pi-coding-agent agent-session.js:773,784)
    - non-goals — PASS — NG1 no visual cue: `notify` only in explicit `/input-bell` command handler (index.ts:75); NG2 no sound customization: single `BEL` constant; NG3 built-in dialogs untouched: only `ui_prompt_start` + `agent_settled` hooked; NG4 no pi changes: diff touches pi-devkit files only
    - doc accuracy — PASS — README Contents entry, `.changesets/001-input-bell.md` (valid schema, user-facing), `docs/catalog.md` regenerated with input-bell row, AGENTS.md module map updated
    - note: validator subagents unavailable in this runtime — dimensions ran inline in the orchestrator; disclosed here
