---
type: security
bump: none
packages: "@lucascaro/pi-guardrails, @lucascaro/pi-input-bell, @lucascaro/pi-model-router, @lucascaro/pi-subagent"
---
- **Use npm trusted publishing for standalone releases.** The manual GitHub workflow publishes with OIDC instead of a long-lived npm token; the initial `0.1.0` releases predate provenance attestations.
