# SECURITY.md

Security posture. Trust boundaries, secret handling, and the rules code is expected to follow.

## Trust boundaries

- Manual, confirmation-gated publication — limited to the four public workspaces by `.github/workflows/publish-plugin.yml`; the selected manifest and exact tarball are validated before publishing.

## Known upstream dependency advisory

The four publishable standalone workspaces require `@earendil-works/pi-coding-agent >=0.99.1`, which avoids the affected `undici` versions in earlier Pi releases. The `0.99.1` package still pins `brace-expansion@5.0.9`; npm audit flags it under [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), and [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p). This is an upstream dependency in the host Pi package; pi-devkit does not bundle or override it. Raise the supported minimum again when upstream ships a Pi release with a fixed `brace-expansion`.

## Publication authentication

- Future standalone releases use npm Trusted Publishing via GitHub Actions OIDC; the publish job requires `id-token: write` and no long-lived `NPM_TOKEN`. Configure a trusted publisher for each package using repository `lucascaro/pi-devkit`, workflow `publish-plugin.yml`, and environment `npm-publish`.
- Keep the GitHub `npm-publish` environment restricted to `main` and protected by required reviewers. The workflow still requires manual dispatch with `confirm_publish=true`.
- The initial `0.1.0` packages were published locally and have no npm provenance attestations. Trusted publishing adds attestations to future releases; it cannot attest those already-published versions retroactively.

## Authentication & authorization

<Identity model. Who is allowed to do what. Link to the auth provider integration.>

## Hard rules

- All external input is parsed at the boundary into typed values.
- No secret values appear in logs, error messages, or version control.
- <Project-specific rules>

## Reporting vulnerabilities

See the top-level `SECURITY.md` (project root) for the disclosure process.
