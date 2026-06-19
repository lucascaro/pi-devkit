# Development

## Local setup

```bash
npm install
npm run check
pi install ./
```

## Resource conventions

- Extensions live in `extensions/<name>/index.ts`.
- Shared code lives in `src/lib`.
- Skills live in `skills/<name>/SKILL.md`.
- Prompts live directly under `prompts/*.md`.
- Themes live directly under `themes/*.json` and must include every Pi color token.

## Testing

Run all checks:

```bash
npm run check
```

Each resource type has validation:

```bash
npm run validate:skills
npm run validate:prompts
npm run validate:themes
npm run validate:extensions
npm run validate:pi-manifest
npm run validate:files
```

Auto-generate the catalog:

```bash
npm run generate:catalog
```
