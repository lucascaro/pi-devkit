# Contributing

## Setup

```bash
git clone git@github.com:lucascaro/pi-devkit.git
cd pi-devkit
npm ci
npm run check
```

## Build / Test / Lint

See `AGENTS.md` → "Build / Test / Lint Commands". All commands must pass before opening a PR.

## Feature Workflow

This project uses the [hivesmith](https://github.com/lucascaro/hivesmith) feature pipeline. From inside your AI coding agent (Claude Code, Codex, Gemini, Copilot, Factory):

1. `/hs-feature-next` — see the current pipeline state and next recommended action
2. `/hs-feature-new <description>` or `/hs-feature-ingest <issue#>` — add a new item
3. `/hs-feature-triage [#]` → `/hs-feature-research [#]` → `/hs-feature-plan [#]` → `/hs-feature-implement [#]`
4. `/hs-changelog-update` — scaffold a `.changesets/<NNN>-<slug>.md` for any user-visible change
5. `/hs-review-pr <#>` — deep parallel review before merge
6. `/hs-release <version>` — cut a release once at least one changeset is present

Specs live under `docs/product-specs/<NNN>-<slug>.md` with YAML frontmatter (`stage:` is the source of truth). Exec plans live under `docs/exec-plans/{active,completed}/`. Per-PR changelog entries live under `.changesets/`; `CHANGELOG.md` itself is **generated** on push to `main` by `scripts/regen-generated.sh` — never edit it directly. `docs/product-specs/index.md` and `docs/exec-plans/tech-debt-tracker.md` are generated the same way.

## Commit Style

<Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `release:`. Link issues with `Fixes #<number>`.>

## Pull Request Checklist

- [ ] Build, lint, and tests pass (see `AGENTS.md`)
- [ ] `.changesets/<NNN>-<slug>.md` added if user-visible (use `/hs-changelog-update`); use the `no-changeset` PR label for docs- or CI-only changes
- [ ] `AGENTS.md` updated if module map or conventions changed
- [ ] Relevant docs updated (`README.md`, `docs/`)
- [ ] PR description references the issue (`Fixes #<number>`)

## Workspace package changes

Each extension workspace under `packages/` is independently installable. Keep runtime code and required assets inside its workspace, declare imported Pi APIs as peer dependencies, and update its `files` and `pi` fields together. The root package manifest must continue to aggregate every extension and shared resource.

Before publishing a workspace, verify its npm name is available, run `npm run check`, inspect `npm pack --workspace <package-name> --dry-run`, and test installation in an isolated Pi configuration. Publish only the intended workspace with `npm publish --workspace <package-name> --access public`; never publish the private `hello` example. Do not install the umbrella and the same standalone plugin together unless the umbrella resource is filtered to prevent duplicate loading.

## Design Guidelines

<Project-specific design/UX rules go here. Delete this section if not applicable.>
