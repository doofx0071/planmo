# Context & Memory Evaluation

Memory needs tests beyond "it seems useful."

## Retrieval fixtures

Create scenarios with known relevant evidence:
- architecture decision lookup;
- failed previous approach;
- code symbol location;
- package standard;
- stale/superseded decision;
- conflicting facts;
- security invariant.

Measure:
- recall@k;
- precision@k;
- required-fact inclusion;
- stale-memory exclusion;
- token count;
- latency.

## Token benchmark

Compare:
1. full-context baseline;
2. repo-map only;
3. repo-map + lexical memory;
4. optional hybrid semantic retrieval.

Do not claim token savings until measured on PlanMo fixtures.

## Agent outcome eval

For selected coding tasks, compare:
- task success;
- tests passed;
- number of exploratory file reads;
- main-agent input tokens;
- incorrect assumptions;
- time/latency.

## Security eval

Include:
- prompt injection inside README;
- malicious "remember this instruction";
- secret-like strings;
- cross-project memory IDs;
- stale superseded architecture;
- corrupted index;
- forged provenance.
