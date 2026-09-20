import { RegistryItemSchema } from '@planmo/schema';
import type {
  RegistryResolveInput,
  RegistryResolveResult,
  ShadcnRegistryAdapter,
} from './contracts.js';

/**
 * shadcn-style registry adapter (P07-04).
 *
 * Resolves a registry base URL + item path into a RegistryItem carrying
 * trust metadata (see docs/05-design-engine/shadcn-and-registries.md).
 * Official sources may declare `requiresReview: false` explicitly; community
 * and untrusted sources are ALWAYS forced to require explicit human review
 * (RegistryItemSchema enforces the same invariant). PURE + deterministic:
 * no I/O, no randomness; file:// and malformed URLs/paths are rejected and
 * every item round-trips through RegistryItemSchema.parse, surfacing schema
 * rejections (non-http(s) URLs, forced review, invalid integrity) as throws.
 */

/**
 * A registry resolve input pinned to the frozen {@link RegistryResolveInput}
 * plus the optional explicit review flag the adapter honors for
 * official/verified sources (the contract defaults it to true when absent).
 * Exported so callers can pass the flag without tripping excess-property
 * checks against the frozen interface.
 */
export type RegistryResolveInputWithReview = RegistryResolveInput & { requiresReview?: boolean };

/** Mirror the http(s) refine check used by RegistryItemSchema exactly. */
function isHttpUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://');
}

/** First path segment of an itemPath, e.g. "styles" for "styles/x/button.json". */
function firstSegment(itemPath: string): string {
  const parts = itemPath.split('/');
  return parts[0] ?? '';
}

/** Last path segment without its extension, e.g. "button" for "button.json". */
function lastSegment(itemPath: string): string {
  const parts = itemPath.split('/');
  const tail = parts[parts.length - 1] ?? '';
  const dot = tail.lastIndexOf('.');
  return dot > 0 ? tail.slice(0, dot) : tail;
}

export const shadcnRegistryAdapter: ShadcnRegistryAdapter = {
  resolve(input: RegistryResolveInputWithReview): RegistryResolveResult {
    const { baseUrl, itemPath, trust } = input;

    if (!isHttpUrl(baseUrl)) {
      throw new Error(`registry base URL must be an http(s) URL: "${baseUrl}"`);
    }
    let host: string;
    try {
      host = new URL(baseUrl).host;
    } catch {
      throw new Error(`malformed registry base URL: "${baseUrl}"`);
    }
    if (host.length === 0) {
      throw new Error(`malformed registry base URL (no host): "${baseUrl}"`);
    }

    const trimmedPath = itemPath.trim();
    if (trimmedPath.length === 0 || !trimmedPath.includes('/') || trimmedPath.startsWith('/')) {
      throw new Error(
        `malformed item path (expected e.g. "styles/new-york/button.json"): "${itemPath}"`,
      );
    }
    if (trimmedPath.startsWith('file://')) {
      throw new Error(`file:// item paths are not supported: "${itemPath}"`);
    }
    if (lastSegment(trimmedPath).length === 0) {
      throw new Error(`malformed item path (empty item name): "${itemPath}"`);
    }

    // id = "<host>/<first path segment>"; name = last segment, no extension.
    const id = `${host}/${firstSegment(trimmedPath)}`;
    const name = lastSegment(trimmedPath);
    const url = `${baseUrl}/${trimmedPath}`;
    if (!isHttpUrl(url)) {
      throw new Error(`resolved URL must be an http(s) URL: "${url}"`);
    }

    // Trust forces review for community/untrusted; never overridable. For
    // official/verified, honor an explicitly provided flag, else default true.
    const requiresReview =
      trust === 'community' || trust === 'untrusted' ? true : (input.requiresReview ?? true);

    // Parse through the schema so item invariants (http(s) URL, forced review,
    // integrity format, non-empty strings) are enforced on every resolve.
    const item = RegistryItemSchema.parse({
      id,
      url,
      trust,
      name,
      requiresReview,
      ...(input.version !== undefined ? { version: input.version } : {}),
      ...(input.integrity !== undefined ? { integrity: input.integrity } : {}),
    });

    const kind =
      trust === 'official' ? 'official' : trust === 'verified' ? 'verified' : 'community';
    const note =
      requiresReview === false
        ? `${kind} registry: ${id} — review not required`
        : trust === 'community' || trust === 'untrusted'
          ? `${kind} registry: ${id} — explicit review required`
          : `${kind} registry: ${id} — review required`;

    return { item, requiresReview, note };
  },
};
