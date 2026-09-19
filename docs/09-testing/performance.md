# Performance Budgets

Initial targets, subject to benchmark ADR:
- `planmo status`: <300ms warm local on normal repo.
- `planmo validate`: <2s moderate planning repo.
- deterministic `init` generation: <2s excluding interaction/network.
- `adopt` static scan: <10s representative medium repo.

Scanner ignores vendor/dependency dirs, bounds file count/size, skips binaries, avoids unbounded Git history by default.
