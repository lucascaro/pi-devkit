# pi-devkit

A batteries-included Pi package with extensions, skills, prompt templates, and themes. Extensions also live in npm workspaces so selected plugins can be installed independently.

## Install the full devkit

From GitHub:

```bash
pi install git:github.com/lucascaro/pi-devkit@v0.1.0
```

From npm, once the umbrella package is published:

```bash
pi install npm:@lucascaro/pi-devkit
```

For local development:

```bash
git clone git@github.com:lucascaro/pi-devkit.git ~/checkout/pi-devkit
cd ~/checkout/pi-devkit
npm ci
npm run check
pi install ./
```

## Install one plugin

After publication, install a plugin without the full devkit:

```bash
pi install npm:@lucascaro/pi-guardrails
pi install npm:@lucascaro/pi-input-bell
pi install npm:@lucascaro/pi-model-router
pi install npm:@lucascaro/pi-subagent
```

Each public plugin has a README under `packages/<plugin>/`. Install either the umbrella package or individual plugins by default. Installing the same plugin both ways can load it twice; Pi package resource filters can exclude it from the umbrella package when combining installs intentionally.

## What's included

- `packages/guardrails` — blocks high-risk bash commands unless confirmed.
- `packages/input-bell` — rings the terminal bell when Pi is waiting for input.
- `packages/model-router` — routes turns across model tiers and profiles.
- `packages/subagent` — delegates tasks to specialized agents; includes workflow prompts.
- `packages/ambiguity-detection`, `packages/anti-people-pleasing`, and `packages/ask-question` — additional prompt/tool extensions.
- `packages/hello` — private example extension used for smoke tests.
- `skills/`, `prompts/`, and `themes/` — shared devkit resources.

See `docs/catalog.md` for the generated inventory. The shared `prompts/plan.md` and `prompts/review.md` are available with the umbrella package; `subagent` workflow prompts ship with that plugin.

## Usage example

Create a plan without immediately implementing:

```text
/plan add a statusline extension
```

The plan prompt clarifies ambiguity, evaluates scope and risk, and asks whether to implement, refine the plan, or continue discussing.

## Development

The repository uses npm workspaces. Run the full validation suite, including package metadata and npm tarball checks:

```bash
npm ci
npm run check
```

Quick-test the hello extension:

```bash
pi -e ./packages/hello/extensions/hello/index.ts
```

Reload installed local changes inside Pi with `/reload`.

## Pi package layout

The root `package.json` is the batteries-included Pi package and points at each workspace's resource directories. Each public workspace has its own `package.json` and Pi manifest, so it can be packed and installed on its own. Generic skills, prompts, and themes remain in the root package; plugin-specific resources ship with their plugin.

## Security

Pi packages run with your system permissions. Review extensions and skills before installing packages from other authors. See `docs/security.md`.
