# pi-devkit

Personal Pi package for developing, tracking, testing, and sharing Pi extensions, skills, prompt templates, and themes.

## Install

From GitHub:

```bash
pi install git:github.com/lucascaro/pi-devkit@v0.1.0
```

For local development:

```bash
git clone git@github.com:lucascaro/pi-devkit.git ~/checkout/pi-devkit
cd ~/checkout/pi-devkit
npm install
npm run check
pi install ./
```

## Contents

- `extensions/hello` - minimal custom tool example.
- `extensions/guardrails` - blocks high-risk bash commands unless confirmed.
- `extensions/model-router` - intelligent per-turn model router with tiered routing, LLM classifier, and configurable profiles.
- `skills/pi-package-author` - workflow for authoring Pi packages.
- `prompts/review.md` - reusable review prompt.
- `prompts/plan.md` - generic planning prompt that clarifies ambiguity before planning, routes lightweight/full plans, and offers interactive accept/edit/chat choices.
- `themes/lucas-dark.json` - complete custom Pi theme.

See `docs/catalog.md` for the maintained inventory.

## Development

```bash
npm install
npm run typecheck
npm run validate
npm test
npm run check
```

Quick-test a single extension:

```bash
pi -e ./extensions/hello/index.ts
```

Reload installed local changes inside Pi with `/reload`.

## Usage examples

Create a plan without immediately implementing:

```txt
/plan add a statusline extension
```

The plan prompt first clarifies ambiguous or risky assumptions, evaluates scope and risk, chooses a lightweight or full plan, then asks whether to accept and implement, edit the plan, or keep chatting. Implementation should start only after explicit approval.

## Pi package manifest

This repository is a Pi package through the `pi` key in `package.json`:

```json
{
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

## Security

Pi packages run with your system permissions. Review extensions and skills before installing packages from other authors. See `docs/security.md`.
