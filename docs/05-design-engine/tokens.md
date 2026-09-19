# Design Tokens

Canonical tokens use the DTCG token model.

Why:
- platform-neutral;
- typed;
- transformable to Tailwind/CSS/shadcn/future native platforms;
- avoids tying PlanMo's model to one framework.

Adapters may generate:
- CSS custom properties;
- Tailwind `@theme`;
- shadcn semantic tokens;
- Style Dictionary-compatible transforms.

Tests cover token types, aliases, cycles, missing references, and invalid unit/value combinations.
