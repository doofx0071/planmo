# State Machines — fixture-app

Every stateful entity is specified as an explicit state machine before it is
implemented. Illegal transitions are rejected by the domain, not the UI.

## Template

### <Entity>

| State | Meaning | Allowed transitions |
|---|---|---|
| <state> | <meaning> | <next states> |

```text
<initial> -> <state> -> <terminal>
```

## Rules

- A state machine has exactly one initial state.
- Every transition names its trigger and its guard.
- Terminal states have no outgoing transitions.
- A transition that can fail records what happens on failure.

## Machines in this project

_None recorded yet. Add one section per stateful entity._
