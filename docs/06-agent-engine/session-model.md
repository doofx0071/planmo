# Session Model

Default generated workflow: one fresh AI session per phase.

Persistent memory:
- repository;
- Git;
- tracker;
- ADRs;
- tests;
- handoff;
- `.planmo/state.yml`.

A phase prompt contains:
- owned task IDs;
- required reading;
- dependency state;
- allowed scope;
- tests;
- security/risk notes;
- exit gates;
- handoff contract;
- hard stop.
