# SECURITY.md

Security posture. Trust boundaries, secret handling, and the rules code is expected to follow.

## Trust boundaries

- Manual plugin publication — limited to the four public workspaces by `.github/workflows/publish-plugin.yml`; the selected manifest is checked before publication and npm validates package ownership/version.

## Known upstream dependency advisory

The four publishable standalone workspaces require `@earendil-works/pi-coding-agent >=0.99.1`, which avoids the affected `undici` versions in earlier Pi releases. The `0.99.1` package still pins `brace-expansion@5.0.9`; npm audit flags it under [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), and [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p). This is an upstream dependency in the host Pi package; pi-devkit does not bundle or override it. Raise the supported minimum again when upstream ships a Pi release with a fixed `brace-expansion`.

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
