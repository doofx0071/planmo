# @planmo/ai

The model-provider abstraction: one interface (`ModelProvider`) with a
**deterministic mock** and an OpenAI-compatible HTTP provider, so no PlanMo package
depends on a vendor SDK.

## Why this package is `private: true` right now

It is **not published to npm yet, on purpose**. Publishing is tokenless OIDC, and
npm trusted publishers are configured **per package** — a package that has never
been published cannot have one, and OIDC cannot bootstrap it. Adding it to the
release made the whole publish run fail with `ENEEDAUTH`, which blocked every other
package in the same release, not just this one.

So it stays out of the publish set until its trusted publisher exists. The repo
still builds, typechecks and tests it; nothing consumes it yet.

To bring it into the release, do this once, in order:

1. Publish it a single time with a token (`npm publish --workspace @planmo/ai`
   using a user-level `~/.npmrc` token — never a token in this repository).
2. On npmjs.com, add a trusted publisher for `@planmo/ai`: owner `doofx0071`,
   repository `planmo`, workflow `release.yml`, permission `npm publish`.
3. Remove `"private": true` from `package.json` and add a changeset for it.

Only then can the next release publish it alongside everything else.

## Using it

```ts
import { createMockProvider, createHttpProvider } from '@planmo/ai';
```

The mock is deterministic — identical input yields byte-identical output — and
always reports `simulated: true`, so a caller can never mistake simulated output
for a real model's. The default test suite uses only the mock: no network, no
credentials. The HTTP provider retries transport, rate-limit and 5xx failures with
bounded backoff, and never retries an auth error.
