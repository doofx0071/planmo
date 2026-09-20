# Trust Engine — Future Architecture

Community packs and remote registries introduce supply-chain risk.

Future PlanMo should be able to represent:
- source repository;
- publisher;
- version;
- checksum/digest;
- license;
- declared capabilities;
- supported PlanMo versions;
- SBOM;
- signature/provenance;
- trust status.

Core v1 rule remains:
**declarative packs do not execute arbitrary remote code.**

Possible future ecosystem integrations may use concepts/tools from:
- Sigstore;
- CycloneDX;
- OSV;
- OpenSSF Scorecard.

These are future capabilities, not Phase 04 blockers.
