# TODOS

## Subagent

### Add least-privilege controls for SDK-backed subagents
**Priority:** P1
**Status:** Deferred until after `small-elm` merges

SDK subagents have no confirmation UI and currently run with the user's system permissions. The inline Bash classifier is a bounded safety aid, not a sandbox; filesystem mutation tools and other execution paths are not covered by it.

**Next:** Design explicit per-agent tool permissions and filesystem scope, plus an appropriate process/capability boundary for command execution. Account for absolute paths, traversal, symlinks, untrusted projects, and cancellation/cleanup.

**Acceptance:** Regression tests prove out-of-scope writes and destructive execution paths are denied; ordinary worker edits within the intended project still work; README and `SECURITY.md` describe the actual boundary; a fresh adversarial review clears.

**Deferred by:** User request on 2026-09-28 to land the current branch before fixing subagent permissions.

## Completed
