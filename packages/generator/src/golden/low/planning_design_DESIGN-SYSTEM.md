# Design System — fixture-app

Accessibility target: `aa`.
Density: `comfortable`.

## Tokens

Tokens are the only source of visual values. Components reference tokens;
they never hard-code a colour, size or duration.

| Group | Token | Value | Notes |
|---|---|---|---|
| Colour | `color.bg` | <value> | page background |
| Colour | `color.fg` | <value> | primary text; must meet contrast at the target level |
| Colour | `color.accent` | <value> | single accent, used sparingly |
| Space | `space.1..n` | <scale> | one scale, no arbitrary values |
| Type | `font.size.1..n` | <scale> | one scale, no arbitrary values |
| Radius | `radius.control`, `radius.card` | <value> | consistent across controls |
| Motion | `motion.fast`, `motion.base` | <ms> | must respect reduced motion |

## Accessibility requirements

- Meet `aa` for every screen.
- Text meets the contrast ratio required by the target level.
- Every control is reachable and operable by keyboard.
- Focus is always visible and never removed without an equivalent.
- Motion honours `prefers-reduced-motion`.
- Meaning is never carried by colour alone.

## Rules

- A value that appears twice is a token that is missing.
- A component that hard-codes a visual value does not pass review.
- Design choices are structured tokens and profiles, not prose.
