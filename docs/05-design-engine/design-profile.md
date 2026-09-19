# Design Profile

Concept:

```yaml
schemaVersion: 1
style:
  id: minimal
  variant: balanced

density: balanced

geometry:
  radius: subtle
  borderStrength: subtle
  shadowUsage: restrained

typography:
  strategy: sans
  maxFamilies: 2

icons:
  strategy: outline

motion:
  profile: restrained
  reducedMotionRequired: true

accessibility:
  target: WCAG-2.2-AA

components:
  system: shadcn
  foundation: recommended
  registries:
    - id: shadcn
      trust: official

responsive:
  mobileFirst: true
```

Backend-only/no-frontend must be a valid profile state.
