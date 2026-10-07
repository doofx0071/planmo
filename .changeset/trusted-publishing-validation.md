---
'planmo': patch
'@planmo/shared': patch
'@planmo/schema': patch
'@planmo/core': patch
'@planmo/scanner': patch
---

Validate npm Trusted Publishing (OIDC) for the v1 release line.

No functional change: this release exists to prove the release workflow publishes
with no npm token, via OIDC (`id-token: write`) and the trusted-publisher
configuration on each package. A real publish is required because npm only
validates a trusted-publisher configuration once it sees an authenticated publish
from the configured repository and workflow.
