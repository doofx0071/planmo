# Domain Model — fixture-app

Entities, value objects and the invariants they enforce. The domain model is
the vocabulary the rest of the system speaks; it is defined before the
schema that persists it.

## Entities

| Entity | Identity | Invariants |
|---|---|---|
| <Entity> | <what makes two instances the same> | <rules that must always hold> |

## Value objects

| Value object | Meaning |
|---|---|
| <ValueObject> | <immutable concept with no identity> |

## Relationships

| From | To | Cardinality | Rule |
|---|---|---|---|
| <Entity> | <Entity> | 1-N | <rule> |

## Domain events

| Event | Emitted when | Consumers |
|---|---|---|
| <Event> | <trigger> | <consumers> |

## Rules

- An invariant is enforced in the domain, not in the UI or the database alone.
- A persisted schema change that alters the domain model is a migration and needs a decision record.
