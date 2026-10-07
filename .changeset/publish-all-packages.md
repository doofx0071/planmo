---
'planmo': patch
---

Publish the seven remaining workspace packages, so all twelve are on npm.

`planmo@1.1.0` shipped depending on `@planmo/generator` and `@planmo/packs`, which were
still private — `npm install planmo@1.1.0` failed with a 404 resolving
`@planmo/generator`. Every package in the CLI's runtime closure is now published, so the
CLI installs again.

The seven were bumped to `1.0.0` directly rather than through a changeset: a `major`
changeset on a `0.x` package cascades patch bumps to every dependent and would have
shipped the whole release as `1.0.1`.
