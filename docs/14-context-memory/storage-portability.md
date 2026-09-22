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

## Portable formats (P11-06)

`@planmo/agent-bridge` implements `exportMemoryPortable` /
`importMemoryPortable` (P11-06) over three deterministic portable formats.
Every format:

- is byte-stable for identical input — no timestamps, no random ids, no
  environment-dependent values;
- sorts rows by `id` before emit (stable `localeCompare` ordering);
- declares `format: "planmo-memory"` and `schemaVersion: 1`; a reader that
  sees anything else rejects the document as malformed or stale;
- round-trips: `importMemoryPortable(exportMemoryPortable(view, rows, f), f)`
  reproduces the same document for all three formats;
- treats imported memory as context data, never as instruction authority
  (REQ-MEM-001).

A row is an agent-neutral memory record with shape
`{ id, kind, summary, source }` where `kind` is one of
`decision | lesson | fact | warning` and `source` is the provenance
(canonical doc/commit) that produced the row.

### JSON — single document

One pretty-printed (2-space) `PortableMemoryDocument`:

```json
{
  "format": "planmo-memory",
  "schemaVersion": 1,
  "context": {
    "project": "acme",
    "contextId": "ct-1",
    "estimatedTokens": 512
  },
  "rows": [
    {
      "id": "row-a",
      "kind": "fact",
      "summary": "First row",
      "source": "docs/A.md"
    }
  ]
}
```

`context` carries `project`, `contextId`, `estimatedTokens`. When no context
view is available the `context` key is omitted entirely. Key order is
canonical (`format`, `schemaVersion`, `context?`, `rows`), so identical
input yields identical bytes.

### JSONL — header line + one row per line

The first line is the document header (the document without `rows`); every
following line is exactly one row. Example:

```jsonl
{"format":"planmo-memory","schemaVersion":1,"context":{"project":"acme","contextId":"ct-1","estimatedTokens":512}}
{"id":"row-a","kind":"fact","summary":"First row","source":"docs/A.md"}
```

A file with only the header line is valid and imports as an empty row set.

### Markdown — heading + one bullet per row

The first line is a fixed heading; an optional context block follows; every
row is one bullet:

```markdown
# planmo-memory (schemaVersion: 1)

project: acme
contextId: ct-1
estimatedTokens: 512

- [fact] First row (source: docs/A.md) <!-- id: row-a -->
```

- The bullet carries the row id in a trailing `<!-- id: <id> -->` comment so
  the format round-trips fully while rendering as the plain bullet
  `- [<kind>] <summary> (source: <source>)`. A hand-written bullet without
  the comment imports with an empty id (and is then treated as
  non-durable — see the file provider below).
- Line breaks inside a `summary` are normalized to spaces on export: a
  markdown bullet must stay one line. This is the only lossy transform; use
  JSON/JSONL when summaries may contain newlines.
- The context block (`project`, `contextId`, `estimatedTokens`) is optional
  and must appear complete (all three lines) before the first bullet.

## Import/export rules

- `importMemoryPortable` throws a descriptive `Error` on malformed input:
  empty text, unparseable JSON, wrong `schemaVersion` (stale), wrong
  `format` identifier, non-object root, non-array `rows`, or rows that are
  not valid memory rows (string `id`/`summary`/`source`, `kind` in the
  four-value union).
- JSONL: blank lines are tolerated; the header may be followed by zero or
  more row lines.
- Markdown: unknown/duplicated metadata or any non-blank line that is not a
  bullet after the header (beyond the metadata block) is rejected.
- Imported documents are canonicalized: unknown top-level fields are not
  carried forward.

## File-backed MemoryProvider (P11-06)

`createFileMemoryProvider({ readText, format, limit? })` adapts a portable
file (JSON/JSONL/Markdown) to the standard `MemoryProvider` interface:

- `relevant(contextId, limit)` reads the raw text for the context, imports
  and validates it, filters rows with a non-empty `id`, sorts by `id`,
  and returns at most `min(limit, configured limit)` rows.
- **The provider never fabricates memory (REQ-MEM-001).** Empty text,
  unreadable source, or unparseable/stale content yields the standard
  explicit no-op row (`no-durable-memory`, source
  `canonical-project-state`) — never invented rows, never raw chat fallback.
- A missing portable file is an ordinary state (no export written yet); the
  provider treats a `readText` rejection the same way.

Portable files are the interchange format, not the canonical store: the
canonical project state always outranks anything imported (REQ-MEM-001,
ADR-0013), and durable memory rows require provenance (REQ-MEM-003).