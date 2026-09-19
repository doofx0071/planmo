# Pack Resolution

Deterministic precedence:
1. explicit project overrides;
2. explicitly selected packs;
3. profile-provided packs;
4. built-in defaults.

Semantic conflicts are errors or require explicit resolution; never silent last-writer-wins.

Resolver outputs:
- selected versions;
- dependency graph;
- conflicts;
- overridden values;
- provenance;
- final lockfile.

Property tests cover permutation invariance where order should not matter.
