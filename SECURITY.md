# SECURITY.md

Security posture. Trust boundaries, secret handling, and the rules code is expected to follow.

## Trust boundaries

- Manual plugin publication — limited to the four public workspaces by `.github/workflows/publish-plugin.yml`; the selected manifest is checked before publication and npm validates package ownership/version.

## Secrets

- `NPM_TOKEN` belongs only in the GitHub `npm-publish` environment. Configure required reviewers on that environment; the publish job reads the token only after repository checks and environment approval. Never store the token in the repository or print it in workflow logs.

## Authentication & authorization

<Identity model. Who is allowed to do what. Link to the auth provider integration.>

## Hard rules

- All external input is parsed at the boundary into typed values.
- No secret values appear in logs, error messages, or version control.
- <Project-specific rules>

## Reporting vulnerabilities

See the top-level `SECURITY.md` (project root) for the disclosure process.
