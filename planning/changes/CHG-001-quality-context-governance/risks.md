# CHG-001 Risks

| ID | Risk | Severity | Mitigation |
|---|---|---:|---|
| R-CTX-01 | Memory becomes a second source of truth | Critical | Canonical authority hierarchy; memory is derived/non-authoritative |
| R-CTX-02 | Stale memory causes incorrect edits | High | provenance + source hashes + validity + supersession + freshness scoring |
| R-CTX-03 | Repository prompt injection enters memory | Critical | classify repo/memory text as data; authority labels; sanitize/extract facts |
| R-CTX-04 | Secrets become persistent memory | Critical | pre-write secret scan/redaction; deny sensitive categories; audit |
| R-CTX-05 | Memory reduces tokens but loses crucial context | High | retrieval evals, token budgets, fallback expansion, source citations |
| R-CTX-06 | Vector/graph infrastructure overcomplicates v1 | High | local-first lexical baseline; adapters later |
| R-CTX-07 | Non-deterministic semantic ranking makes tests flaky | Medium | deterministic lexical baseline; injectable fake embeddings; stable tie-breakers |
| R-CTX-08 | Memory DB corruption blocks agents | Medium | rebuildable index; exportable records; doctor/repair |
| R-CTX-09 | Over-aggressive pruning deletes useful knowledge | Medium | source-of-truth stays elsewhere; soft expiry; audit/export before prune |
| R-QLT-01 | Quality rules become rigid style policing | Medium | warnings + evidence; stack-aware policies; override with rationale |
| R-CHG-01 | Change engine duplicates Git | Medium | changes describe planning deltas; Git remains code/history authority |
| R-WRK-01 | Claims become stale and block work | Medium | leases/expiry + explicit release |
