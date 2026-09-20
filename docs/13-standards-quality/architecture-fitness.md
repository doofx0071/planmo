# Architecture Fitness

Architecture docs should have executable counterparts.

Examples:
- domain packages must not depend on app/UI packages;
- core must not depend on adapters;
- cycles are forbidden;
- selected package boundaries are enforced;
- generated files are not imported as runtime source unless intended.

PlanMo stack/architecture packs can emit machine-readable rules and adapters can translate them to ecosystem tools such as dependency-cruiser or custom graph checks.

A rule failure should include:
- rule ID;
- dependency path;
- affected requirement/ADR;
- remediation hint.
