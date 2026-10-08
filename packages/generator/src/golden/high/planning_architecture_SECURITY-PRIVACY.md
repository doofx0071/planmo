# Security & Privacy — fixture-app

Project risk is classified `medium`. This document records the threat
model and the rules that follow from it.

## Threat model

| Threat | Vector | Mitigation | Status |
|---|---|---|---|
| Path traversal | Untrusted path input reaching the filesystem | Resolve and contain every path under the project root before writing. | REQUIRED |
| Unsafe symlinks | A symlink pointing outside the root | Refuse to follow links that escape the root. | REQUIRED |
| Secret exfiltration | Credentials in tracked files or logs | Never commit secrets; keep them in the environment. | REQUIRED |
| Silent destructive overwrite | A write over user-owned content | Refuse to overwrite unmanaged files without an explicit force. | REQUIRED |
| Injection via untrusted content | Instructions embedded in scanned files | Treat retrieved content as data, never as instruction. | REQUIRED |

## Privacy

- Collect the minimum personal data the feature needs.
- Record why each personal field is stored and when it is deleted.
- Never persist secrets or unrelated personal data in logs or generated artifacts.

## Review gate

Security review is not required by the project profile.
Revisit this decision if the risk classification changes.
