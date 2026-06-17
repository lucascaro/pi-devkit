# Security

Pi packages execute with the same permissions as the user running Pi.

## Rules for this repository

- Keep extension behavior explicit and documented.
- Do not start background processes from extension factories.
- Start session-scoped resources on `session_start` and clean them up on `session_shutdown`.
- Ask for confirmation before destructive actions.
- Do not read or write secrets unless the resource explicitly documents why.
- Keep runtime dependencies minimal and reviewed.
