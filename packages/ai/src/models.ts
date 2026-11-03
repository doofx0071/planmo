import { providerPreset } from './providers.js';
import type { ModelListCapability, ModelListPagination, ModelListResponse } from './providers.js';

/** Maximum provider-reported model ids returned to an interactive picker. */
export const MAX_MODEL_LIST_IDS = 500;
/** Bound the streamed response body before JSON parsing. */
export const MAX_MODEL_LIST_RESPONSE_BYTES = 1_000_000;
/** Bound each provider request, including body streaming. */
export const MODEL_LIST_TIMEOUT_MS = 10_000;
const MAX_MODEL_ID_LENGTH = 256;

/** A fixed, redacted failure for every provider-listing error path. */
export class ModelListError extends Error {
  constructor() {
    super('Could not retrieve the provider model list.');
    this.name = 'ModelListError';
  }
}

export interface ListProviderModelsOptions {
  providerId: string;
  /** Resolved API key; used only to construct the declared request auth header. */
  credential: string;
  /** Fetch injection keeps tests and callers offline by default. */
  fetcher?: typeof fetch;
  /** Per-request timeout override, primarily for deterministic tests. */
  timeoutMs?: number;
  /** Lower the byte cap for tests; values above the hard cap are clamped. */
  maxResponseBytes?: number;
}

export interface ProviderModelList {
  /** Provider-reported ids, not a guarantee of PlanMo model compatibility. */
  modelIds: string[];
  /** True when a limit or un-followed continuation link leaves the list incomplete. */
  truncated: boolean;
}

interface ParsedPage {
  modelIds: string[];
  hasExtraIds: boolean;
  hasContinuationLink: boolean;
  hasMore?: boolean;
  lastId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeModelId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    value.trim() === value &&
    !value.trim().startsWith('--') &&
    value.length <= MAX_MODEL_ID_LENGTH &&
    !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)
  );
}

function safeObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ModelListError();
  return value;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ModelListError();
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) throw new ModelListError();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new ModelListError();
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The fixed size error is the only detail exposed to the caller.
        }
        throw new ModelListError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ModelListError();
  }
}

function requestHeaders(capability: ModelListCapability, credential: string): Headers {
  const headers = new Headers({ accept: 'application/json' });
  if (capability.auth.type === 'bearer') {
    headers.set('authorization', `Bearer ${credential}`);
  } else {
    headers.set(capability.auth.credentialHeader, credential);
    for (const [name, value] of Object.entries(capability.auth.headers)) headers.set(name, value);
  }
  return headers;
}

async function requestJson(
  endpoint: string,
  capability: ModelListCapability,
  credential: string,
  fetcher: typeof fetch,
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(endpoint, {
      method: capability.method,
      headers: requestHeaders(capability, credential),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // Status and body details are deliberately not exposed.
      }
      throw new ModelListError();
    }
    return parseJson(await readBoundedBody(response, maxResponseBytes));
  } catch {
    throw new ModelListError();
  } finally {
    clearTimeout(timer);
  }
}

function parsePage(
  value: unknown,
  responseShape: ModelListResponse,
  pagination: ModelListPagination,
  alreadySeenModelIds: ReadonlySet<string>,
): ParsedPage {
  const body = safeObject(value);
  const rows = body[responseShape.collection];
  if (!Array.isArray(rows)) throw new ModelListError();

  const modelIds: string[] = [];
  const pageSeenModelIds = new Set<string>();
  let hasExtraIds = false;
  for (const rowValue of rows) {
    const row = safeObject(rowValue);
    const id = row[responseShape.idField];
    if (typeof id === 'string' && id.trim().startsWith('--')) continue;
    if (!isSafeModelId(id)) throw new ModelListError();

    let include = true;
    if ('outputModalitiesField' in responseShape) {
      const modalities = row[responseShape.outputModalitiesField];
      if (
        !Array.isArray(modalities) ||
        !modalities.every((modality) => typeof modality === 'string')
      ) {
        throw new ModelListError();
      }
      include = modalities.includes(responseShape.includesOutputModality);
    }

    if (!include || pageSeenModelIds.has(id)) continue;
    pageSeenModelIds.add(id);
    if (alreadySeenModelIds.has(id)) continue;
    if (modelIds.length < MAX_MODEL_LIST_IDS + 1) modelIds.push(id);
    else hasExtraIds = true;
  }

  const hasContinuationLink =
    'continuationLink' in responseShape &&
    responseShape.continuationLink === 'links.next' &&
    isRecord(body.links) &&
    body.links.next !== undefined &&
    body.links.next !== null;

  if (pagination.type === 'none') return { modelIds, hasExtraIds, hasContinuationLink };

  if (typeof body.has_more !== 'boolean') throw new ModelListError();
  let lastId: string | undefined;
  if (body.last_id !== undefined && body.last_id !== null) {
    if (!isSafeModelId(body.last_id)) throw new ModelListError();
    lastId = body.last_id;
  }
  if (body.has_more && lastId === undefined) throw new ModelListError();
  return {
    modelIds,
    hasExtraIds,
    hasContinuationLink,
    hasMore: body.has_more,
    ...(lastId !== undefined ? { lastId } : {}),
  };
}

function paginationEndpoint(
  capability: ModelListCapability,
  pagination: Extract<ModelListPagination, { type: 'anthropic-cursor' }>,
  afterId?: string,
): string {
  const endpoint = new URL(capability.endpoint);
  endpoint.searchParams.set('limit', String(pagination.limit));
  if (afterId !== undefined) endpoint.searchParams.set('after_id', afterId);
  return endpoint.toString();
}

function appendModelIds(
  pageIds: readonly string[],
  modelIds: string[],
  seen: Set<string>,
): boolean {
  let truncated = false;
  for (const id of pageIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (modelIds.length >= MAX_MODEL_LIST_IDS) {
      truncated = true;
      continue;
    }
    modelIds.push(id);
  }
  return truncated;
}

/**
 * Fetch provider-reported model ids using only the preset's explicit list contract.
 * No preset means no request; endpoint paths are never derived from inference URLs.
 */
export async function listProviderModels({
  providerId,
  credential,
  fetcher = globalThis.fetch,
  timeoutMs = MODEL_LIST_TIMEOUT_MS,
  maxResponseBytes = MAX_MODEL_LIST_RESPONSE_BYTES,
}: ListProviderModelsOptions): Promise<ProviderModelList> {
  const preset = typeof providerId === 'string' ? providerPreset(providerId) : undefined;
  const capability = preset?.modelList;
  if (
    capability === null ||
    capability === undefined ||
    typeof credential !== 'string' ||
    credential.trim() === '' ||
    typeof fetcher !== 'function' ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes <= 0
  ) {
    throw new ModelListError();
  }

  const boundedResponseBytes = Math.min(maxResponseBytes, MAX_MODEL_LIST_RESPONSE_BYTES);
  const modelIds: string[] = [];
  const seen = new Set<string>();
  const pagination = capability.pagination;

  if (pagination.type === 'none') {
    const body = await requestJson(
      capability.endpoint,
      capability,
      credential,
      fetcher,
      timeoutMs,
      boundedResponseBytes,
    );
    const page = parsePage(body, capability.response, pagination, seen);
    const truncated =
      appendModelIds(page.modelIds, modelIds, seen) || page.hasExtraIds || page.hasContinuationLink;
    return { modelIds, truncated };
  }

  let afterId: string | undefined;
  const cursors = new Set<string>();
  for (let pageIndex = 0; pageIndex < pagination.maxPages; pageIndex++) {
    const body = await requestJson(
      paginationEndpoint(capability, pagination, afterId),
      capability,
      credential,
      fetcher,
      timeoutMs,
      boundedResponseBytes,
    );
    const page = parsePage(body, capability.response, pagination, seen);
    if (
      appendModelIds(page.modelIds, modelIds, seen) ||
      page.hasExtraIds ||
      page.hasContinuationLink
    ) {
      return { modelIds, truncated: true };
    }
    if (page.hasMore !== true) return { modelIds, truncated: false };
    if (pageIndex === pagination.maxPages - 1) return { modelIds, truncated: true };

    const cursor = page.lastId;
    if (cursor === undefined || cursors.has(cursor) || cursor === afterId) {
      throw new ModelListError();
    }
    cursors.add(cursor);
    afterId = cursor;
  }

  return { modelIds, truncated: true };
}
