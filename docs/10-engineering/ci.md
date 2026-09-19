# CI Plan

PR:
1. frozen install;
2. lint/format;
3. typecheck;
4. unit/integration;
5. golden verification;
6. core CLI E2E;
7. dependency/security scan;
8. selected Windows/macOS/Linux matrix.

Periodic:
- full cross-platform E2E;
- broader agent adapter fixtures;
- fuzz/property suite;
- dependency freshness report.

Release:
- clean build;
- tests;
- version/changelog validation;
- provenance/signing where available;
- npm package contents audit;
- smoke install in clean temp projects.
