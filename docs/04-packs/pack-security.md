# Pack Security

v1 pack contributions are data/templates only.

Forbidden:
- shell hooks;
- npm lifecycle hooks;
- arbitrary JS evaluation;
- binary execution;
- unconstrained output paths.

Template context exposes only approved structured values. All output paths pass core safe-writer validation.
