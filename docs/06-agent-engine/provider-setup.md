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
| `xai` | `https://api.x.ai/v1` | OpenAI-compatible | `XAI_API_KEY` | `GET https://api.x.ai/v1/models` (bearer key; documented) | API key |
| `openrouter` | `https://openrouter.ai/api/v1` | OpenAI-compatible | `OPENROUTER_API_KEY` | `GET https://openrouter.ai/api/v1/models?limit=500` (bearer key; documented) | API key |
| `custom` | User-supplied HTTPS endpoint | OpenAI-compatible | `PLANMO_AI_API_KEY` | Not assumed; manual model id unless the endpoint is explicitly verified | API key / compatible endpoint |

Every model-list response is untrusted metadata. The implementation must bound response bytes and item count, validate the response shape, display ids rather than trusting provider-supplied instructions, and fall back to manual model entry when a route is unavailable or malformed. For Anthropic, send the required `x-api-key` and `anthropic-version` headers; do not treat its Messages protocol as OpenAI-compatible.

## Official references for the model-list routes

- Token Harbor: [Models API](https://tokenharbor.ai/docs/api/models) and [API usage](https://tokenharbor.ai/docs/api/curl)
- OpenAI: [List models](https://developers.openai.com/api/reference/resources/models/methods/list)
- Anthropic: [List models](https://platform.claude.com/docs/en/api/models/list)
- DeepSeek: [List models](https://api-docs.deepseek.com/api/list-models/)
- Moonshot/Kimi: [List models](https://platform.kimi.ai/docs/api/list-models)
- xAI: [List inference models](https://docs.x.ai/developers/rest-api-reference/inference/models)
- OpenRouter: [List models and properties](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
- Custom: no universal model-list contract; inspect the endpoint owner documentation.

The base URLs and environment-variable names above remain pinned by `packages/ai/src/providers.test.ts`. Model-list URLs must be declared separately from inference base URLs: DeepSeek's documented `/models` route is root-level even though its inference preset base URL includes `/v1`. OpenRouter's documented list request includes a bearer API key and `limit=500`; do not assume the catalog is public. A documented list route does not imply that PlanMo has implemented or tested a model-list client yet.

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
