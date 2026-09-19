# Determinism and Reproducibility

Normalize before hashing/rendering:
- line endings;
- logical path separators;
- map key order where relevant;
- generated timestamps isolated from primary content;
- pack resolution order.

Golden tests compare semantic output where platform formatting may differ.

Generation metadata that changes over time must be isolated from deterministic content.
