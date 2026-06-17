---
name: pi-package-author
description: Build and maintain Pi packages with extensions, skills, prompt templates, themes, package manifests, validation, tests, and docs. Use when creating or changing shareable Pi customizations.
---

# Pi Package Author

Use this skill when the user wants to create, improve, test, or publish a Pi package.

## Workflow

1. Read the package `README.md`, `package.json`, and `docs/catalog.md`.
2. Identify which Pi resource types are changing: extensions, skills, prompts, themes, or package metadata.
3. Follow Pi best practices:
   - Extensions export a default factory receiving `ExtensionAPI`.
   - Extensions do not start long-lived resources in the factory.
   - Session-scoped resources start on `session_start` and stop on `session_shutdown`.
   - Skills include valid frontmatter with a specific description.
   - Prompt templates include clear descriptions and argument hints when useful.
   - Themes define every required Pi color token.
4. Add or update tests and validation for every changed resource.
5. Update `docs/catalog.md` and `CHANGELOG.md` for user-visible changes.
6. Run `npm run check` before declaring the package ready.

## References

- Pi package docs: https://pi.dev
- Local package manifest: `package.json`
