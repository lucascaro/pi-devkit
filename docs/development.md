# Development

## Local setup

```bash
npm install
npm run check
pi install ./
```

## Resource conventions

- Extensions live in `extensions/<name>/index.ts`.
- Shared code lives in `src/lib`.
- Skills live in `skills/<name>/SKILL.md`.
- Prompts live directly under `prompts/*.md`.
- Themes live directly under `themes/*.json` and must include every Pi color token.
- Custom models are configured in `~/.pi/agent/models.json` (user-level, not repo-level).

## Testing

Run all checks:

```bash
npm run check
```

Each resource type has validation:

```bash
npm run validate:skills
npm run validate:prompts
npm run validate:themes
npm run validate:extensions
npm run validate:pi-manifest
npm run validate:files
```

Auto-generate the catalog:

```bash
npm run generate:catalog
```

## Managing custom models

Pi loads custom model definitions from `~/.pi/agent/models.json` at runtime — no restart needed. Edit during a session and switch with `/model` to pick up changes.

### Provider structure

Each provider entry needs:

- `baseUrl` — API endpoint
- `api` — API type (`openai-completions`, `anthropic-messages`, `google-generative-ai`)
- `apiKey` — any value (Ollama ignores it)
- `models` — array of model configs

Example `omlx` provider (Apple Silicon MLX models served via Ollama):

```json
{
  "providers": {
    "omlx": {
      "baseUrl": "http://localhost:8000/v1",
      "api": "openai-completions",
      "apiKey": "1234",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false,
        "maxTokensField": "max_tokens"
      },
      "models": [
        {
          "id": "rautaditya/Qwen3-4B-Instruct-MLX-4bit",
          "name": "Qwen3 4B Instruct 4-bit (OMLX)",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 32768,
          "maxTokens": 4096
        }
      ]
    }
  }
}
```

### Adding a new model to an existing provider

1. Open `~/.pi/agent/models.json` and find the provider block.
2. Add a new model object to the `models` array with the model's `id` (HuggingFace repo ID or Ollama tag).
3. Set `name` to something readable — this is what shows in the UI.
4. Copy `compat`, `contextWindow`, `maxTokens`, and `cost` from a sibling model to keep consistency.
5. Save the file — Pi picks it up on the next `/model` invocation.

### Common model fields

| Field | Default | Notes |
|-------|---------|-------|
| `id` | — | Passed to the API; for Ollama this is the model tag |
| `name` | `id` | Human-readable label shown in the model picker |
| `reasoning` | `false` | Set `true` if the model supports extended thinking |
| `input` | `["text"]` | Add `"image"` for multimodal |
| `contextWindow` | `128000` | Context window in tokens |
| `maxTokens` | `16384` | Max output tokens |
| `cost` | `0` everywhere | Per-million-token pricing |

### Provider-level `compat` for local servers

Ollama and local MLX servers typically need:

```json
"compat": {
  "supportsDeveloperRole": false,
  "supportsReasoningEffort": false,
  "maxTokensField": "max_tokens"
}
```

This applies to every model under that provider. You can also set `compat` per-model to override.

### Ollama minimal example

For Ollama models, only `id` is strictly required:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b" }
      ]
    }
  }
}
```
