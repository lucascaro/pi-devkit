# Changelog

## [Unreleased]

### Added

- Show the concrete upstream response model selected by aliases such as `openrouter/auto` in model-router status, widget, and debug history.
- Initial Pi package repository with extensions, skills, prompts, themes, validation scripts, tests, CI, and checked-in plan.

### Changed

- Recalculate routed request cost from the concrete response model when Pi has pricing metadata for it, while retaining conservative configured pricing for unknown OpenRouter auto selections.
- Made `/plan` generic, with early scope/risk evaluation, lightweight plans for small changes, iterative refinement, and an explicit approval gate before implementation.
- Updated `/plan` to ask whether to accept and implement, edit the plan, or continue discussing after presenting a plan.
- Updated `/plan` to clarify ambiguous requests and risky assumptions before showing an implementation plan.
