# @planmo/ai

The model-provider abstraction: one interface (`ModelProvider`) with a
**deterministic mock** and an OpenAI-compatible HTTP provider, so no PlanMo package
depends on a vendor SDK.

## Publishing

Published from CI via OIDC trusted publishing (`.github/workflows/release.yml`).
There is no token anywhere in this repository, and no npm secret configured.

npm trusted publishers are configured **per package**, and a package must already
exist on npm before one can be configured for it — so the first version of any new
package has to be published manually, once:

1. Publish it a single time with a user-level token (`~/.npmrc`, never a token in
   this repository).
2. Add its trusted publisher on npmjs.com: owner `doofx0071`, repository `planmo`,
   workflow filename `release.yml`, no environment, and **tick `npm publish`** as
   well as `npm stage publish` — `changeset publish` uses plain `npm publish`.
3. From then on CI publishes it with every release.

This matters beyond the one package: adding an unpublished package to a release
aborts the *entire* publish run with `ENEEDAUTH`, so every other package in that
release stays unpublished too. Bootstrap a new package on its own.


## Using it

```ts
import { createMockProvider, createHttpProvider } from '@planmo/ai';
```

The mock is deterministic — identical input yields byte-identical output — and
always reports `simulated: true`, so a caller can never mistake simulated output
for a real model's. The default test suite uses only the mock: no network, no
credentials. The HTTP provider retries transport, rate-limit and 5xx failures with
bounded backoff, and never retries an auth error.

### Providers

`PROVIDER_PRESETS` is a declared table of gateways and vendors (Token Harbor,
OpenAI, Anthropic, DeepSeek, Moonshot/Kimi, xAI/Grok, OpenRouter, and an
overridable `custom`). Each row records only the credential **env var name** and
the wire protocol — never a key and never a model list — so a gateway like Token
Harbor can serve `provider/model` slugs from a single key. `resolveProvider`
selects one from an injected `env` (or `process.env`); `describeProviders(env)`
returns render-ready rows. `createHttpProvider` speaks either wire format:

```ts
import { resolveProvider, createHttpProvider } from '@planmo/ai';

const resolved = resolveProvider({ env: process.env, model: 'deepseek/deepseek-v4-flash' });
if (resolved.configured) {
  const provider = createHttpProvider({
    baseUrl: resolved.baseUrl,
    apiKey: process.env[resolved.preset.credentialEnv]!,
    model: resolved.model ?? '',
    wireFormat: resolved.wireFormat, // 'openai' | 'anthropic'
  });
}
```
