# System Architecture

PlanMo is a local-first modular CLI application.

```text
+----------------------+       +-----------------------+
| CLI / Agent Adapter  |       | Optional AI Provider  |
+----------+-----------+       +-----------+-----------+
           |                               |
           +---------------+---------------+
                           v
                 +--------------------+
                 | Context / Discovery|
                 +---------+----------+
                           v
                 +--------------------+
                 | Canonical Model    |
                 +---------+----------+
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
      Pack Resolver     Policy Engine   Design Engine
          |                |                |
          +----------------+----------------+
                           v
                 +--------------------+
                 | Planning Compiler  |
                 +---------+----------+
                           |
              +------------+------------+
              |            |            |
              v            v            v
          Generator     Validator     Trace Graph
              |            |            |
              +------------+------------+
                           v
                  Project Files/State
```

Core modules:
- schema
- core
- cli
- packs
- generator
- scanner
- design-engine
- workflow
- trace
- agent-bridge
- adapters

No module bypasses schema validation for persistent state.
