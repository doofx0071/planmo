# Schema Versioning

Every persisted PlanMo document has explicit schema versioning.

Rules:
- reject unsupported future major versions;
- migrations are explicit and tested;
- no silent user-data discard;
- `planmo doctor` detects mixed incompatible state;
- pre-1.0 migration behavior still gets release notes.

Migration tests:
- previous fixture -> current;
- re-read idempotency;
- invalid input diagnostics;
- preservation of supported user extension fields.
