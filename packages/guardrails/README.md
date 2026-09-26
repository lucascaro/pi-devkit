# Pi Guardrails

Blocks high-risk bash commands unless the user confirms them. In non-interactive mode, detected dangerous commands are blocked. The `/guardrails` command reports that protection is active.

## Install

```bash
pi install npm:@lucascaro/pi-guardrails
```

Review the extension source before installing. Guardrails are a safety aid, not a complete security boundary. The batteries-included package `@lucascaro/pi-devkit` also includes this extension.
