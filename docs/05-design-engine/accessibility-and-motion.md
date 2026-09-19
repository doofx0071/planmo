# Accessibility and Motion

Default web target: WCAG 2.2 AA unless stronger is required.

Style cannot override:
- contrast;
- keyboard navigation;
- focus visibility;
- semantics;
- reduced motion;
- touch targets;
- accessible names/labels.

Motion profiles:
- `none`
- `restrained`
- `expressive`
- `cinematic`

`restrained` is default for general product UI.

Generated docs should include anti-patterns such as purposeless continuous animation, excessive bounce, hidden state changes, and hover-only essential actions.
