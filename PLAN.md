# pi-devkit Plan

## Goal

Create a well-maintained Pi package repository for developing, tracking, testing, and sharing Pi customizations.

## Package strategy

Use Pi's package system instead of forking Pi. The repository exposes conventional resource directories through `package.json`:

- `extensions/` for TypeScript extensions.
- `skills/` for Agent Skills-compatible workflows.
- `prompts/` for reusable prompt templates.
- `themes/` for complete Pi TUI themes.

## Quality bar

- TypeScript strict mode for extension and helper code.
- Unit tests for extension registration and shared logic.
- Validation scripts for skill frontmatter, prompt frontmatter, and theme token completeness.
- GitHub Actions running `npm run check` on every push and pull request.
- Docs catalog updated when resources are added or removed.
- Changelog updated for user-visible changes.

## Initial deliverables

- Package manifest installable by `pi install git:github.com/lucascaro/pi-devkit`.
- Starter `hello` extension.
- Starter `guardrails` extension.
- Starter Pi package authoring skill.
- Review and plan prompt templates.
- Complete Lucas dark theme.
- Validation scripts, tests, CI, README, security docs, and catalog.

## Next improvements

- Add release workflow for npm publishing.
- Add screenshots or GIFs for package gallery metadata.
- Add end-to-end smoke tests gated behind `PI_E2E=1`.
- Add more personal workflow extensions as they stabilize.
