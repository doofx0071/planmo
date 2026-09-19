# Schema fixtures

Golden fixtures (`*.v1.golden.*`) are documents that MUST parse against the
current v1 schemas unchanged — they lock the accepted shape and prove
round-trip serialization is lossless.

Legacy fixtures (`*.v0.legacy.yml`) represent documents authored before
schemaVersion existed (v0). Migration tests run them through the registered
v0 -> v1 steps and assert the result parses as v1 with `extensions` intact.

When a v2 schema lands, add `*.v1.legacy.yml` fixtures and a v1 -> v2
migration step; the framework already enforces a contiguous chain.