# Model Router Extension

Intelligent per-turn model router for the pi coding agent. Automatically selects between high, medium, and low-tier LLMs based on task intent, session budget, context size, and custom rules.

## Quick Start

```bash
# 1. Create a config from the example
/router init

# 2. Enable the router with the default profile
/router enable

# 3. Or switch to a specific profile
/router profile balanced

# 4. Check status
/router status
```

## Configuration

The router reads config from:

- **Global**: `~/.pi/agent/model-router.json` (created by `/router init`)
- **Project**: `.pi/model-router.json` (relative to your workspace root)

Project config overrides global config.

## What it does

- **Logical Router Provider**: Registers a `router` provider that exposes stable profiles (e.g., `router/balanced`) as models.
- **Per-Turn Routing**: Intelligently chooses between `high`, `medium`, and `low` tiers for every turn based on task intent and complexity.
- **Task-Aware Heuristics**: Detects planning vs. implementation vs. lightweight tasks using keyword analysis, word count, and conversation history.
- **LLM Classifier**: Optionally uses a fast, cheap model to categorize intent (overrides heuristics).
- **Advanced Controls**: Custom rules, cost budgeting, fallback chains, phase memory, and thinking level overrides.

## Installation

This extension is included in `pi-devkit`. After installing the package, the router is available automatically.

### Basic Config Shape

```json
{
  "classifierModel": "google/gemini-flash-latest",
  "maxSessionBudget": 1.0,
  "profiles": {
    "balanced": {
      "high": { "model": "openai/gpt-5.4", "thinking": "high", "fallbacks": ["anthropic/claude-sonnet-4-6"] },
      "medium": { "model": "anthropic/claude-sonnet-4-6", "thinking": "medium" },
      "low": { "model": "google/gemini-flash-latest", "thinking": "low" }
    }
  }
}
```

### Configuration Fields

| Field | Description |
|---|---|
| `classifierModel` | Model used to categorize intent. Supports model aliases. If omitted, fast heuristics are used. |
| `maxSessionBudget` | USD budget for the session. Forces `medium` tier once exceeded. |
| `phaseBias` | (0.0–1.0) Stickiness of the current phase. Higher = more stable. Default `0.5`. |
| `rules` | List of custom keyword rules (e.g., `{ "matches": "deploy", "tier": "high" }`). |
| `models` | Map of model aliases to definitions with `model`, `contextWindow`, `maxOutputTokens`. |
| `profiles` | Map of profile definitions, each containing optional `high`, `medium`, and `low` tiers. |

## Commands

| Command | Description |
|---|---|
| `/router` | Show detailed status, current profile, spend, and settings. |
| `/router status` | Alias for `/router` (show current status). |
| `/router profile [name]` | Switch to a profile or list available ones. |
| `/router pin <tier\|auto>` | Pin a tier (high/medium/low/auto) for the active profile. |
| `/router fix <tier>` | Correct the last decision and pin that tier. |
| `/router thinking <level>` | Override thinking level for all tiers. |
| `/router thinking <tier> <level>` | Override thinking level for a specific tier. |
| `/router disable` | Disable the router and switch back to the last non-router model. |
| `/router widget <on\|off\|toggle>` | Toggle the persistent state widget. |
| `/router debug <on\|off\|show\|clear>` | Toggle turn-by-turn routing notifications. |
| `/router reload` | Hot-reload the configuration JSON. |
| `/router help` | Show usage help for all subcommands. |

## Profiles

Ship with three default profiles:

- **balanced** — GPT-5.4 for high, Sonnet for medium, Gemini Flash for low.
- **cheap** — All tiers use budget models (Flash/Haiku).
- **deep** — GPT-5.4 with xhigh thinking for high, Sonnet for medium, Flash for low.

## Architecture

The router uses a tiered decision flow:

1. **Budget Check** — Downgrade to `medium` if `maxSessionBudget` is exceeded.
2. **Manual Pin** — Use tier pinned via `/router pin` or `/router fix`.
3. **Custom Rules** — Check keyword-based rules against the user prompt.
4. **LLM Classifier** — Call `classifierModel` for intent categorization (optional).
5. **Heuristics** — Use local heuristics (keyword detection, phase stickiness) as fallback.
6. **Phase Bias** — Apply stickiness to maintain a consistent tier during multi-turn tasks.

## Extensibility

- **New profiles**: Add entries to the `profiles` object in the config file.
- **New rules**: Add entries to the `rules` array with `matches` keywords and `tier`.
- **Model aliases**: Define aliases in the `models` object for reuse across profiles.
- **Custom classifier**: Change `classifierModel` to any fast model for intent detection.
