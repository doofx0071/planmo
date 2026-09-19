# Property / Fuzz Testing

High-value properties:

## Path safety
Arbitrary pack path either resolves within root or is rejected without write.

## Pack resolution
Independent pack selection permutations yield same semantic resolution.

## Manifest regeneration
Unchanged inputs/files produce no-op regeneration.

## State transitions
Invalid phase/task transitions never persist as valid state.

## Token references
Alias graph fully resolves or yields deterministic cycle/missing-reference diagnostics.
