# Standards Engine

## Purpose

The Standards Engine answers:

> What rules and patterns should an implementation agent follow for this exact task?

It prevents two bad extremes:
1. a tiny generic `AGENTS.md` that lacks important stack conventions;
2. a giant prompt containing every rule for every framework.

## Standard classes

- global engineering
- language
- framework
- domain
- security
- accessibility
- testing
- organization/project
- package/module-local

## Precedence

Suggested precedence, most specific/highest authority first:

1. explicit accepted project policy
2. package/module-local accepted standard
3. project standard
4. security/compliance standard
5. stack/framework standard
6. language standard
7. global PlanMo default

Conflicts must be surfaced, not silently resolved by an LLM.

## Retrieval

A work packet declares:
- task IDs;
- paths;
- stack;
- domain;
- risk tags;
- test types.

The Standards Engine selects only matching standards and compiles a bounded `standards` section into the Context Bundle.

## Brownfield discovery

`planmo standards discover` may infer candidate conventions from code:
- naming;
- directory patterns;
- tests;
- error handling;
- dependency boundaries;
- common abstractions.

Discovered conventions are **candidates** until accepted because existing code can contain bad legacy patterns.
