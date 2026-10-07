# @planmo/shared

## 1.0.2

### Patch Changes

- 5473462: Add a README to every published package and fill in npm metadata (repository,
  homepage, bugs, keywords), and enable npm provenance attestation.
  
  The published tarballs previously contained only `dist/`, `package.json` and
  `LICENSE`, so the npm pages rendered empty with no usage information. No runtime
  change.

## 1.0.1

### Patch Changes

- 15dcca6: Validate npm Trusted Publishing (OIDC) for the v1 release line.
  
  No functional change: this release exists to prove the release workflow publishes
  with no npm token, via OIDC (`id-token: write`) and the trusted-publisher
  configuration on each package. A real publish is required because npm only
  validates a trusted-publisher configuration once it sees an authenticated publish
  from the configured repository and workflow.

## 1.0.0

### Major Changes

- First public release. `@planmo/shared` is part of the v1.0.0 CLI runtime
  closure: `planmo` depends on it (ADR-0009/0010 keep plain `tsc` emit, so there
  is no bundle and the closure must be published). The exported utility surface
  is stable for v1.
