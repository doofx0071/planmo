# Pack System

Categories:
- stack
- domain
- risk
- design
- agent
- workflow

v1 packs may contribute declarative metadata, questions, defaults, requirements, rules, templates/fragments, design tokens, agent instructions, validation constraints.

v1 packs may not execute arbitrary code.

Example:

```yaml
schemaVersion: 1
id: design/minimal
version: 1.2.0
category: design
compatibility:
  planmo: ">=0.7 <2"
provides:
  - design.style.minimal
conflicts:
  - design/neobrutalism
contributes:
  designProfile:
    - profile.yml
  tokens:
    - tokens.json
```
