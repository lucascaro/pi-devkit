# AGENTS.md

Table of contents for AI agents (and humans) working in this repo. **Keep this file short.** It is a map, not an encyclopedia. Detailed rules live in the linked files; this file just routes you there.

## Project Overview

Personal Pi package (`@lucascaro/pi-devkit`) that bundles Pi extensions, skills, prompt templates, and themes for the pi coding agent. TypeScript (ESM), vitest for tests, tsx for validation scripts. Installed into pi via `pi install`.

## How to navigate this repo

| If you need to know... | Read |
|------------------------|------|
| What this project does at a high level | `README.md` |
| The architectural shape — domains, layers, cross-cutting concerns | [`DESIGN.md`](DESIGN.md) |
| Project-wide design beliefs | [`docs/design-docs/core-beliefs.md`](docs/design-docs/core-beliefs.md) |
| Per-decision design rationale | [`docs/design-docs/`](docs/design-docs/index.md) |
| What's planned and why (product-side) | [`docs/product-specs/`](docs/product-specs/index.md) |
| What's being built right now (engineering-side) | [`docs/exec-plans/active/`](docs/exec-plans/active/) |
| What was built and the decisions made along the way | [`docs/exec-plans/completed/`](docs/exec-plans/completed/) |
| Mechanical rules `gc-sweep` enforces | [`golden-principles.md`](golden-principles.md) |
| Reliability targets and verification | [`RELIABILITY.md`](RELIABILITY.md) |
| Security posture and trust boundaries | [`SECURITY.md`](SECURITY.md) |
| Quality grades per domain/layer | [`QUALITY_SCORE.md`](QUALITY_SCORE.md) |
| Product taste and tie-breaker heuristics | [`PRODUCT_SENSE.md`](PRODUCT_SENSE.md) |
| Frontend conventions (if applicable) | [`FRONTEND.md`](FRONTEND.md) |
| How planning works | [`PLANS.md`](PLANS.md) |
| Known shortcuts and deferrals | [`docs/exec-plans/tech-debt-tracker.md`](docs/exec-plans/tech-debt-tracker.md) |
| External docs pulled in for agent context | [`docs/references/`](docs/references/README.md) |

## Build / Test / Lint

All of these must pass before a PR merges. `/hs-feature-implement` runs them.

- **Build:** `npm run typecheck`
- **Lint:** `npm run validate`
- **Tests:** `npm run test`
- **Everything:** `npm run check`

## Module Map

- `extensions/` — Pi extensions: `ambiguity-detection`, `anti-people-pleasing`, `guardrails`, `hello`, `model-router`
- `skills/` — Pi skills: `pi-package-author`
- `prompts/` — prompt templates: `plan.md`, `review.md`
- `themes/` — TUI themes
- `src/lib/` — shared TS library code (e.g. `dangerous-command.ts`)
- `scripts/` — tsx validation + catalog-generation scripts
- `test/` — vitest tests (`extensions/`, `validation/`)

## Workflows

This project uses [hivesmith](https://github.com/lucascaro/hivesmith) skills:

- **Feature pipeline** — `/hs-feature-next` → (`/hs-feature-new` or `/hs-feature-ingest <#>`) → `/hs-feature-triage` → `/hs-feature-research` → `/hs-feature-plan` → `/hs-feature-implement` → `/hs-review-loop`
- **PR convergence** — `/hs-review-loop` drives review-respond-iterate on any PR until findings clear or it escalates.
- **Doc gardening** — `/hs-doc-garden` scans `docs/` for staleness and opens fix-up PRs.
- **Golden-principle GC** — `/hs-gc-sweep` reads `golden-principles.md` and opens small refactor PRs for deviations.
- **Code gardening** — `/hs-code-garden` runs a daily one-category hygiene sweep and opens at most one small PR.

The previous flat `features/` layout has moved into `docs/`: specs to `docs/product-specs/`, plans to `docs/exec-plans/{active,completed}/`. `feature-*` skills read the new locations and fall back to `features/` for one release.

## Documentation Maintenance

- `CHANGELOG.md` — every user-visible change goes under `[Unreleased]` (use `/hs-changelog-update`; `/hs-release` stamps the date).
- `AGENTS.md` (this file) — update when the navigation table or workflows change. Otherwise, edit the deeper files.
- `README.md` — update for user-visible feature additions or setup changes.
- `docs/` — update alongside the feature, not after. `/hs-doc-garden` will catch drift but it's cheaper to keep it fresh.

## Commit Style

Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `release:`. Link issues with `Fixes #<number>`.
