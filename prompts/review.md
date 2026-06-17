---
description: Review code changes for bugs, security, maintainability, and Pi best practices
argument-hint: "[focus]"
---
Review the current changes. Focus on ${ARGUMENTS:-bugs, security issues, maintainability, tests, and docs}.

For Pi customizations, verify:
- Extensions clean up session-scoped resources.
- Custom tools have clear schemas and descriptions.
- Skills have valid frontmatter and specific trigger descriptions.
- Prompt templates are reusable and documented.
- Themes define every required token.
