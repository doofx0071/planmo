# Context & Memory Security

## Threats

### Memory poisoning
Malicious repository text or compromised agent output stores false instructions as memory.

Mitigation:
- repository text is `untrusted_data`;
- durable memories require provenance;
- authority/trust labels;
- high-impact procedural memories require accepted source;
- prompt-like text does not gain instruction authority.

### Stale memory
Old architecture facts survive after refactor.

Mitigation:
- source hashes;
- temporal validity;
- supersession;
- freshness checks;
- `doctor` warnings.

### Secret persistence
Tokens/credentials appear in session summaries.

Mitigation:
- secret scanning/redaction before persistence;
- denylist categories;
- no raw transcript persistence by default;
- memory files/db excluded from Git where appropriate.

### Cross-project leakage
A memory from Project A appears in Project B.

Mitigation:
- explicit project scope IDs;
- default-deny scope filters;
- isolated local stores.

### Over-retrieval
Sensitive or irrelevant memories are unnecessarily injected.

Mitigation:
- least-context retrieval;
- sensitivity filters;
- purpose/task scopes.

## Authority labels

Every retrieved item should carry a class such as:
- canonical
- accepted_policy
- derived_trusted
- inferred
- untrusted_external

The agent adapter must preserve these distinctions.
