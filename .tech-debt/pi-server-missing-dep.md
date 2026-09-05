---
item: Remove @earendil-works/pi-server devDependency workaround once pi-coding-agent declares it
surfaced_in: 001-ring-terminal-bell-for-input
severity: low
owner: unowned
notes: pi-coding-agent 0.85.0's library entry (dist/index.js -> main.js -> experimental/server.js) imports @earendil-works/pi-server but does not declare it in package.json. The bundled CLI is unaffected. File an issue with earendil-works; drop the devDep (and the compat-subpath imports if a newer pi-ai restores the main-entry export) when fixed upstream.
---
