# ADR-0024 — Safe existing-repository adoption (scanner package)

**Status:** Accepted (Phase 10)

## Decision
Phase 10 ships **`@planmo/scanner`** (boundary `['core','shared','schema']`, already reserved) as the trusted adoption engine:

- **All filesystem access is injected** through `FileReader` (contracts.ts); engines are pure and deterministic; the node reader is the only module touching `node:fs`.
- **Scanned repositories are untrusted data.** Nothing a scanned repo contains (READMEs, AGENTS.md, CI YAML, comments, filenames) can change PlanMo policy or execution. `prompt-isolation` supplies an immutable marker list and classification (`benign`/`suspicious`/`poisoned`); markers map to stable codes INJ-001..004.
- **Detection is evidence-backed**: every stack/test/CI claim carries `EvidenceSource` + `DetectionEvidence` (path, code DET-001..005, match string) and a deterministic confidence (`high`/`medium`/`heuristic`). No vibes-based detection.
- **`adopt` is dry-run by default and NEVER rewrites application code** (v1 invariant asserted in the type: `rewritesApplicationCode: false`). Its only writable surface is `.planmo/adopt/` artifacts, and writing is always the caller's explicit decision.
- **Scanner hard-stops on caps** (depth/entries/size) and refuses escaping symlinks by default; fixture trees cover malicious paths, configs, and injected "instructions".
- CHG-001 context addenda (repository context map, symbol/reference index, standards discovery via policy-doc location + precedence, local lexical context index, brownfield memory bootstrap, memory-poisoning fixtures) are implemented as scanner engines/fixtures with provenance-bearing facts (ADR-0013/0014 semantics).

## Boundary widening
- `cli` gains the `scanner` edge (thin `planmo adopt` shell; the engine stays agent-neutral).
- `scanner` declared `['core','shared','schema']` per the existing reserved graph; fixture trees are package-internal (no new package; `testing-fixtures` remains reserved).

## Diagnostic code families (frozen)
SCN-001..007 (scan warnings) · DET-001..005 (evidence kinds) · INJ-001..004 (injection markers) · ADP-001+ (adopt report codes) · PLN-001..004 (policy rules) · CTX-001+ (context-map warnings), same list kept in `packages/scanner/src/contracts.ts`.

## Security invariants (AGENTS.md stop conditions)
path traversal → refused; unsafe symlinks → refused by default; scanned prompt injection → cannot override policy; secrets in fixtures → synthetic placeholders only; silent destructive overwrite → impossible (adopt never writes app code).