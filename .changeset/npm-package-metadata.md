---
'planmo': patch
'@planmo/shared': patch
'@planmo/schema': patch
'@planmo/core': patch
'@planmo/scanner': patch
---

Add a README to every published package and fill in npm metadata (repository,
homepage, bugs, keywords), and enable npm provenance attestation.

The published tarballs previously contained only `dist/`, `package.json` and
`LICENSE`, so the npm pages rendered empty with no usage information. No runtime
change.
