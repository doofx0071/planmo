# Policy Register

The policies that apply to this project, where they come from, and how they
are enforced. A policy with no enforcement is a wish.

| Policy | Source | Class | Enforcement | Status |
|---|---|---|---|---|
| sec-basic | security | security | Automated where a test exists; otherwise reviewed at the phase gate. | ACTIVE |
| fmt-prettier | language | language | Automated where a test exists; otherwise reviewed at the phase gate. | ACTIVE |

## Sources

- standards/planmo
- policy/engineering

## Rules

- Conflicts between standards are surfaced, never silently resolved.
- A policy is added only with a named source.
- Accessibility outranks visual style.
