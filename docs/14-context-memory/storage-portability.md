# Storage & Portability

## Recommendation

Do not bind PlanMo's canonical model to Mem0, Graphiti, or any hosted vendor.

Define interfaces:

- `MemoryStore`
- `MemoryRetriever`
- `ContextIndex`
- `ContextCompiler`
- `EmbeddingProvider` (optional)
- `MemoryExporter`

## Local-first baseline

The baseline should support:
- zero hosted infrastructure;
- deterministic lexical retrieval;
- persistent local records;
- rebuildable indexes;
- export/import.

The exact storage implementation should be selected through an ADR after cross-platform benchmarking. SQLite/FTS-style storage is a strong candidate, but the interface matters more than the initial driver.

## Optional future adapters

- embeddings/vector index;
- Mem0;
- Graphiti/temporal graph;
- enterprise remote context service.

## Portability

Canonical context/memory export formats should be plain JSON/JSONL/Markdown so a project can move between OpenCode, Codex, Claude Code, or future harnesses.
