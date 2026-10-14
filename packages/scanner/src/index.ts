/**
 * @planmo/scanner — existing-repository adoption engine (Phase 10).
 *
 * Safe, deterministic, evidence-backed analysis of REPOSITORIES THAT ARE NOT
 * TRUSTED. Everything here treats scanned content as data: prompt-like text in
 * a scanned repo can never override PlanMo policy (security/prompt-isolation),
 * adopt never rewrites application code (adopt/adopt), and all filesystem
 * access flows through an injected FileReader so engines stay pure.
 */

export * from './contracts.js';

// Scan layer (P10-01): safe walker + readers (node reader is the only node:fs).
export {
  safeScanner,
  isSafeRelativePath,
  linkEscapes,
  SCAN_DEFAULTS,
  SCAN_WARNING_CODES,
} from './scan/safe-scanner.js';
export { NodeFileReader, nodeFileReader } from './scan/node-reader.js';
export { DEFAULT_EXCLUDES } from './contracts.js';
export { ConstructorReader, constructorReader } from './scan/virtual-reader.js';

// Detection layer (P10-02): evidence + confidence stack/test/CI detection.
export { stackDetector } from './detect/stack-detector.js';

// Security layer (P10-03): immutable prompt-injection isolation policy.
export { promptIsolation, classify, policy } from './security/prompt-isolation.js';

// Suggestion secret policy (AI-setup Plan T14).
export { isSuggestionExcludedPath, redactSuggestionContent } from './security/suggest-policy.js';
export type { SuggestionRedactionResult } from './security/suggest-policy.js';

// Adoption layer (P10-04): dry-run planning engine.
export { adopt } from './adopt/adopt.js';

// Context layer (CHG-001, P10-06..P10-10).
export { contextMapEngine } from './context/context-map.js';
export { standardsDiscovery } from './context/standards-discovery.js';
export { symbolIndex } from './context/symbol-index.js';
export { lexicalContext, MAX_TOKENS_PER_FILE } from './context/lexical-context.js';
export { memoryBootstrap } from './context/memory-bootstrap.js';

// Suggestion context batching (AI-setup Plan T15): deterministic, redacted,
// token-budgeted repository context batches for consent-gated AI review.
export {
  suggestionContextEngine,
  estimateSuggestionTokens,
  SUGGESTION_CONTEXT_DEFAULTS,
  SUGGESTION_SKIP_REASONS,
} from './context/suggestion-context.js';
export type {
  SuggestionContextEngine,
  SuggestionContextOptions,
  SuggestionContextResult,
  SuggestionContextCoverage,
  SuggestionContextFile,
  SuggestionBatch,
  SuggestionSkippedFile,
  SuggestionSkipReason,
  SuggestionLexicalEntry,
} from './context/suggestion-context.js';

// Fixtures (P10-05, P10-11): realistic untrusted brownfield + poisoning trees.
export {
  brownfieldFixture,
  brownfieldFiles,
  brownfieldTreeRoot,
  brownfieldDescription,
} from './fixtures/brownfield.js';
export { POISONING_TREE } from './fixtures/poisoning.js';

// End-to-end composition (lead-owned pipeline).
export { analyzeRepository } from './pipeline.js';
