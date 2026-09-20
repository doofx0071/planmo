# Task Graph & Execution Packets

## Task graph

Tasks should form an explicit dependency graph.

Commands envisioned:
- `planmo ready`
- `planmo claim <task>`
- `planmo release <task>`

A task is READY only when dependencies/gates are satisfied.

## Claims

Parallel agents can claim work with leases:
- claimant ID;
- acquired time;
- expiration;
- branch/worktree;
- paths/ownership.

Expired claims can be reclaimed after explicit checks.

## Execution Packet

A worker receives:
- task and acceptance criteria;
- requirement links;
- applicable standards;
- architecture constraints;
- relevant Context Bundle;
- risks;
- allowed/forbidden paths;
- required tests;
- handoff/report contract.

This reduces guessing and prompt duplication.
