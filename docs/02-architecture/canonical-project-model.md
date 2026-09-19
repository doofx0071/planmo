# Canonical Project Model

Representative structure:

```yaml
schemaVersion: 1
project:
  name: Example
  lifecycle: greenfield
  type: web-application
  risk: medium

stack:
  frontend: nextjs
  backend: nestjs
  database: postgres

design:
  style: minimal
  density: balanced
  accessibility: WCAG-2.2-AA
  componentSystem: shadcn

planning:
  depth: production
  phaseMode: gated
  freshSessionPerPhase: true

agents:
  primary: opencode

packs:
  - stack/nextjs
  - stack/postgres
  - design/minimal
  - risk/production-web
```

Requirements, decisions, risks, workflows, and trace links can be normalized subdocuments instead of one giant YAML file.
