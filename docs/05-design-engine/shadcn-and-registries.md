# shadcn and Registry Integration

shadcn is an integration surface, not PlanMo's internal model.

Current shadcn registry capabilities make it useful for distributing components, hooks, pages, config, rules, prompts, themes, and other files.

Rules:
- official sources have explicit trust metadata;
- community registries remain third-party/untrusted;
- record source, item, version/ref, integrity where available;
- high-assurance profiles require explicit review for third-party code;
- registry content never bypasses PlanMo path/ownership safety.
