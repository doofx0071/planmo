import {
  genericAdapter,
  opencodeAdapter,
  codexAdapter,
  claudeCodeAdapter,
  type AgentAdapter,
  type AgentInvocation,
  type AgentRequest,
  type AdapterCapabilities,
} from '@planmo/adapters';

/**
 * Capability registry (P06-01).
 *
 * Canonical agent ids come from the schema AGENT_IDS enum (opencode,
 * claude-code, generic). The registry additionally allows a registered
 * extension (e.g. codex adapter from P06-04) without changing canonical
 * state (ADR-0008: codex is not a v1-primary agent; the generic contract
 * allows adding adapters without architecture change).
 *
 * Lookups are deterministic and pure. Adapters register themselves through
 * `register`; the registry exposes capability queries so the bridge can
 * choose an adapter for a request and degrade explicitly.
 */

export interface AdapterRegistry {
  /** All adapter ids in deterministic order. */
  ids(): readonly string[];
  /** Lookup an adapter by id; undefined when unknown/unregistered. */
  get(id: string): AgentAdapter | undefined;
  /** Resolve the adapter for a request id with explicit degradation. */
  resolve(
    id: string,
    requested: Partial<AdapterCapabilities>,
  ): { adapter: AgentAdapter } | { error: string };
  render(id: string, request: AgentRequest): AgentInvocation | undefined;
}

/** Capability defaults: everything off unless the adapter declares it. */
export const NO_CAPABILITIES: AdapterCapabilities = {
  supportsStructuredOutput: false,
  supportsContextFiles: false,
  supportsResume: false,
  supportsInlineContext: false,
};

export function createRegistry(): MutableRegistry {
  const adapters = new Map<string, AgentAdapter>();

  const registry: AdapterRegistry = {
    ids() {
      return [...adapters.keys()].sort();
    },
    get(id) {
      return adapters.get(id);
    },
    resolve(id, requested) {
      const adapter = adapters.get(id);
      if (!adapter)
        return {
          error: `unknown adapter "${id}" (registered: ${[...adapters.keys()].sort().join(', ') || 'none'})`,
        };
      return { adapter };
    },
    render(id, request) {
      const adapter = adapters.get(id);
      if (!adapter) return undefined;
      return adapter.render(request);
    },
  };

  return Object.assign(registry, {
    register(adapter: AgentAdapter): void {
      if (adapters.has(adapter.id)) {
        throw new Error(`duplicate adapter registration: "${adapter.id}"`);
      }
      adapters.set(adapter.id, adapter);
    },
  });
}

export type MutableRegistry = AdapterRegistry & { register(adapter: AgentAdapter): void };

/**
 * Default registry with all Phase 06 adapters registered: the three
 * v1-primary agents (generic, opencode, claude-code) plus the codex
 * extension adapter (ADR-0008: codex is not a v1-primary agent; the generic
 * contract allows it as an extension without architecture change).
 */
export function createDefaultRegistry(): MutableRegistry {
  const registry = createRegistry();
  registry.register(genericAdapter);
  registry.register(opencodeAdapter);
  registry.register(claudeCodeAdapter);
  // Codex: extension adapter, NOT a v1-primary agent (ADR-0008 reconcile;
  // canonical AGENT_IDS stays opencode | claude-code | generic).
  registry.register(codexAdapter);
  return registry;
}
