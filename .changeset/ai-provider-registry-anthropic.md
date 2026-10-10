---
'@planmo/ai': minor
---

`@planmo/ai` gains a provider registry and an Anthropic wire format.

A declared `PROVIDER_PRESETS` table covers Token Harbor, OpenAI, Anthropic,
DeepSeek, Moonshot/Kimi, xAI/Grok, OpenRouter and an overridable `custom` row.
Each preset records only the credential **env var name** and the wire protocol it
speaks — never a key and never a model list — so a gateway like Token Harbor can
serve `provider/model` slugs from one key. `resolveProvider` picks a preset from
an injected environment (explicit args, else the first credential present, else a
`none-configured` result it never throws over) and never returns a provider whose
credential is missing; `describeProviders` returns render-ready rows.

`createHttpProvider({ wireFormat: 'anthropic' })` speaks the Anthropic Messages
API (`POST {baseUrl}/messages`, `x-api-key`, `anthropic-version`) alongside the
existing OpenAI path, mapping errors to the same `ProviderError` kinds and
honouring `timeoutMs`/`AbortSignal`. Still no vendor SDK and no runtime
dependency — `fetch` only.
