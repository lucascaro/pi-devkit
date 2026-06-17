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
- `skills/pi-package-author` - workflow for authoring Pi packages.
- `prompts/review.md` - reusable review prompt.
- `prompts/plan.md` - reusable implementation planning prompt.
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
