# AI provider capability inventory

This table describes the eight runtime presets currently declared in `packages/ai/src/providers.ts`; it does not claim that every provider method or account plan is supported by PlanMo. PlanMo v1 authenticates these presets with an API key (from the OS keyring or that provider's documented environment variable). When both are available, a nonblank environment variable takes precedence; the keyring is used only when the environment variable is blank. OAuth, consumer subscription logins, and account-plan flows are not implemented.

## Current PlanMo runtime presets

| Provider id | API base URL | Wire format | Key source | Model discovery | PlanMo auth status |
| --- | --- | --- | --- | --- | --- |
| `tokenharbor` | `https://tokenharbor.ai/v1` | OpenAI-compatible | `TOKENHARBOR_KEY` | `GET https://tokenharbor.ai/v1/models` (bearer key; documented) | API key |
| `openai` | `https://api.openai.com/v1` | OpenAI-compatible | `OPENAI_API_KEY` | `GET https://api.openai.com/v1/models` (bearer key; documented) | API key |
| `anthropic` | `https://api.anthropic.com/v1` | Anthropic Messages | `ANTHROPIC_API_KEY` | `GET https://api.anthropic.com/v1/models` (API key + `anthropic-version`; paginated; documented) | API key |
| `deepseek` | `https://api.deepseek.com/v1` | OpenAI-compatible | `DEEPSEEK_API_KEY` | `GET https://api.deepseek.com/models` (root-level bearer endpoint; documented) | API key |
| `moonshot` | `https://api.moonshot.ai/v1` | OpenAI-compatible | `MOONSHOT_API_KEY` | `GET https://api.moonshot.ai/v1/models` (bearer key; documented) | API key |
| `xai` | `https://api.x.ai/v1` | OpenAI-compatible | `XAI_API_KEY` | `GET https://api.x.ai/v1/language-models` (bearer key; `models[].id`, text-output entries only; documented) | API key |
| `openrouter` | `https://openrouter.ai/api/v1` | OpenAI-compatible | `OPENROUTER_API_KEY` | `GET https://openrouter.ai/api/v1/models?limit=500` (bearer key; continuation reported but not followed) | API key |
| `custom` | User-supplied HTTPS endpoint | OpenAI-compatible | `PLANMO_AI_API_KEY` | No declared list endpoint; manual model id only | API key / compatible endpoint |

Every model-list response is untrusted metadata. The client reads a bounded stream (1 MB maximum), validates each response shape, accepts only model ids up to 256 characters that are nonblank, unpadded, and free of control, Unicode format, and line/paragraph separator characters, and returns at most 500 ids. It ignores provider names/descriptions/instructions and shows only provider-reported ids; that does not guarantee PlanMo compatibility. Unavailable, malformed, oversized, timed-out, or failed requests fall back to ordinary manual model entry. Anthropic uses `x-api-key` plus `anthropic-version: 2023-06-01`, requests pages of 100, and exposes truncation after at most five pages. Do not treat its Messages protocol as OpenAI-compatible. OpenRouter uses the documented `limit=500` request and reports a declared `links.next` continuation as truncated without following or validating its URL.

## Official references for the model-list routes

- Token Harbor: [Models API](https://tokenharbor.ai/docs/api/models) and [API usage](https://tokenharbor.ai/docs/api/curl)
- OpenAI: [List models](https://developers.openai.com/api/reference/resources/models/methods/list)
- Anthropic: [List models](https://platform.claude.com/docs/en/api/models/list)
- DeepSeek: [List models](https://api-docs.deepseek.com/api/list-models/)
- Moonshot/Kimi: [List models](https://platform.kimi.ai/docs/api/list-models)
- xAI: [List language models](https://docs.x.ai/developers/rest-api-reference/inference/models.md)
- OpenRouter: [List models and properties](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
- Custom: no universal model-list contract; inspect the endpoint owner documentation.

Every `ProviderPreset` explicitly declares its exact model-list URL, method, auth, response shape, and pagination; custom has a null capability. The list client uses only that declaration and never derives a route from the inference `baseUrl`: DeepSeek's documented `/models` route is root-level even though its inference preset includes `/v1`. OpenRouter's documented request uses a bearer key and `limit=500`; a declared response-supplied `links.next` is reported as truncation, never followed or URL-validated. The client and route are unit-tested with injected fetch responses; no live provider request is implied, and a provider-reported id is not a PlanMo compatibility guarantee.

## Counts and non-provider inventories

| Source | Count | What the count means |
| --- | ---: | --- |
| `@planmo/ai` | 8 | Runtime provider presets listed above, including one generic custom endpoint |
| `@planmo/agent-bridge` | 32 | Coding-agent installation targets; not model inference providers |
| Hermes `model` picker | 39 | Provider/profile choices (one is a generic direct-API profile), plus separate local-model and custom-endpoint choices |
| Models.dev live catalog | 228 | Provider metadata candidates from the source listed in `docs/PLAN-ai-setup-and-codebase-suggestions.md`; not 228 tested PlanMo adapters or approved login flows |

OpenCode's login UI has a searchable Services list and Popular shortcuts. Its catalog count and Hermes's picker count differ because they include profile/region/plan variants and different integration types. The full 228-entry candidate checklist is in the execution plan; uncheck unwanted candidates there before planning adapter work.

## Scope and trust rules

- PlanMo must not present the 32 agent targets as model providers.
- A Models.dev name, gateway, local runtime, regional endpoint, or subscription-plan entry is a candidate only until its official API/auth contract is verified and a real PlanMo adapter test passes.
- User-selected API-key providers use the environment-variable name in the table or a keyring reference; values never appear in this document, config, stdout, tests, or project files.
- OAuth/account-plan methods require separate provider-specific approval and an official, permitted flow. Do not import credentials from Hermes, OpenCode, or another client.
