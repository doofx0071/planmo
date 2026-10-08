# Architecture — fixture-app

## System shape

A `web-application` with the stack below. Components are
described by responsibility and dependency direction; dependencies point
inward toward the domain, never outward toward frameworks.

## Components

| Component | Responsibility | Depends on |
|---|---|---|
| Frontend | Presentation layer (react) | Domain / API |

## Dependency direction

1. Presentation depends on application; application depends on domain.
2. The domain depends on nothing but its own types.
3. Infrastructure is reached through interfaces the domain owns.

## Boundaries

- Every module has one reason to change.
- Cross-boundary calls go through an explicit contract, never a shared mutable state.
- Generated artifacts are never hand-edited.

## Stack

- language: typescript
- frontend: react
- test: vitest
