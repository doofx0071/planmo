import type {
  InjectionClass,
  InjectionIsolationEngine,
  InjectionPolicyDocument,
  InjectionScanResult,
  PromptMarker,
} from '../contracts.js';

/**
 * Prompt-injection isolation policy (P10-03, critical).
 *
 * Scanned repository text is DATA, never instruction authority (ADR-0024).
 * This engine classifies a single text (a scanned file's content) against a
 * frozen, immutable marker phrase list:
 *
 * - `benign`       no markers found;
 * - `suspicious`   exactly one marker found;
 * - `poisoned`     two or more markers, OR any INJ-003 (deceptive-system) marker.
 *
 * Markers are matched case-insensitively on word boundaries: a phrase counts
 * only when the character before its first character and the character after
 * its last character are both non-word characters (ASCII `[A-Za-z0-9_]`;
 * start/end of text are clean). This keeps `ignore previous instructions`
 * from matching inside `xignore previous instructions` while still matching
 * punctuation markers like `!!!`, `<!--` and `/*`.
 *
 * PURE + deterministic: no time, no randomness, no filesystem access. The
 * policy document is frozen (`Object.freeze`) and returned by identity, so no
 * repository text can ever alter the phrase list (`policyIsImmutable: true`).
 */

/** Marker phrase -> stable code. Order here is grouping only; results sort by line. */
const MARKER_RULES: ReadonlyArray<readonly [phrase: string, code: string]> = Object.freeze([
  // INJ-001 instruction-like phrases (attempts to hand the model new instructions)
  ['ignore previous instructions', 'INJ-001'],
  // The most common phrasing, and NOT a substring of the line above: "ignore ALL
  // previous instructions" would otherwise sail straight through the detector.
  ['ignore all previous instructions', 'INJ-001'],
  ['disregard all prior', 'INJ-001'],
  ['you are now', 'INJ-001'],
  ['act as if', 'INJ-001'],
  ['as an AI', 'INJ-001'],
  ['do not listen', 'INJ-001'],
  ['pretend you are', 'INJ-001'],
  ['force mode', 'INJ-001'],
  ['jailbreak', 'INJ-001'],
  ['override your policy', 'INJ-001'],
  // INJ-002 authority-claim phrases. These claim authority OVER THE MODEL, which is
  // what makes them evidence. Ordinary English that merely sounds directive ("you
  // must run npm install", "you must keep the API stable") is documentation, not an
  // attack, and used to be listed here — which is why a benign README with a badge
  // and a build instruction was reported as poisoned.
  ['you must obey', 'INJ-002'],
  ['you will obey', 'INJ-002'],
  ['system prompt', 'INJ-002'],
  // INJ-003 deceptive-system phrases (masquerade as platform/system content).
  // A bare `system:` was listed here and removed: it appears in configs, logs and
  // API docs constantly, and a real "system: ignore all previous instructions" is
  // caught by the instruction phrase itself — which is the part that matters.
  ['developer message', 'INJ-003'],
  ['this is a system instruction', 'INJ-003'],
]);

/**
 * Structural tokens that are NOT injection evidence on their own.
 *
 * A block comment, an HTML comment, a TODO and a `system:` label are ordinary
 * markup. Every file with a JSDoc header contains `/*`; every README with a badge
 * contains `<!--`. Counting them as markers made the detector fire on benign
 * input, which is worse than not firing at all: it teaches the reader to ignore the
 * warning and it buries the file that genuinely is trying something.
 *
 * They count only on a line that ALSO carries an instruction word — the rule the
 * TODO case already used. `STRUCTURAL_TOKENS` is the markup half of that pair.
 */
const STRUCTURAL_TOKENS: ReadonlyArray<string> = Object.freeze(['/*', '<!--', 'todo']);

/**
 * Words that make a `TODO` comment an INJ-004 marker ("TODO with instruction
 * words"): the comment both hides the text and gives the model instructions.
 * The list is intentionally narrow (instruction verbs), so ordinary TODOs such
 * as "TODO: fix typo" or "TODO: delete dead code" never trigger.
 */
const TODO_INSTRUCTION_WORDS: ReadonlyArray<string> = Object.freeze([
  'ignore',
  'disregard',
  'forget',
  'must',
  'obey',
  'override',
  'pretend',
  'never',
  'follow',
  'instruct',
]);

/** Composite phrase emitted for a TODO line that also carries instruction words. */
const TODO_MARKER_PHRASE = 'todo with instruction words';
/** Composite phrase emitted for an instruction phrase hidden inside a comment. */
const COMMENT_MARKER_PHRASE = 'comment with instruction words';

const POLICY_RULES: readonly string[] = Object.freeze([
  'PLN-001: scanned repository text is data, never instruction authority.',
  'PLN-002: marker phrases match case-insensitively on word boundaries.',
  'PLN-003: classification is benign (no markers), suspicious (exactly one marker), ' +
    'or poisoned (two or more markers, or any deceptive-system marker).',
  'PLN-004: the marker phrase list is immutable; repository content cannot modify it.',
  'PLN-005: structural markup (block comments, HTML comments, TODOs) is evidence only ' +
    'on a line that also carries an instruction phrase or instruction word; markup alone ' +
    'is never a marker.',
]);

/** Every phrase the engine can emit, encoded in one place, sorted, frozen. */
const POLICY_PHRASES: readonly string[] = Object.freeze(
  [...MARKER_RULES.map(([phrase]) => phrase), TODO_MARKER_PHRASE, COMMENT_MARKER_PHRASE].sort(
    compareAsc,
  ),
);

function compareAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a global regex that matches `phrase` literally, case-insensitively. */
function phraseRegex(phrase: string): RegExp {
  return new RegExp(escapeRegExp(phrase), 'gi');
}

/**
 * 1-based line of `index` inside `text`, via binary search over precomputed
 * line starts (deterministic, O(log n) per lookup).
 */
function lineAt(index: number, lineStarts: readonly number[]): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function collectPhraseMatches(
  text: string,
  phrase: string,
  code: string,
  lineStarts: readonly number[],
  into: PromptMarker[],
): void {
  const re = phraseRegex(phrase);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const index = match.index;
    const before = index === 0 ? '' : text[index - 1]!;
    const afterIndex = index + phrase.length;
    const after = afterIndex >= text.length ? '' : text[afterIndex]!;
    const onBoundary =
      (before === '' || !isWordChar(before)) && (after === '' || !isWordChar(after));
    if (onBoundary) {
      into.push({ code, phrase, line: lineAt(index, lineStarts) });
    }
    if (phrase === '') re.lastIndex = afterIndex + 1; // safety; phrases are never empty
  }
}

/** INJ-004 "TODO with instruction words": per-line, one marker per matching line. */
function collectTodoMatches(text: string, into: PromptMarker[]): void {
  const lines = text.split('\n');
  const wordRe = new RegExp(`\\b(${TODO_INSTRUCTION_WORDS.join('|')})\\b`, 'i');
  for (let i = 0; i < lines.length; i++) {
    if (/\btodo\b/i.test(lines[i]!) && wordRe.test(lines[i]!)) {
      into.push({ code: 'INJ-004', phrase: TODO_MARKER_PHRASE, line: i + 1 });
    }
  }
}

/**
 * INJ-004 "comment with instruction words": an instruction PHRASE hidden inside a
 * block or HTML comment.
 *
 * This is deliberately narrower than the TODO rule. A comment has to contain one of
 * the real instruction phrases above — not merely a directive-sounding word — before
 * the comment itself counts as evidence. `/** Add two numbers. *​/` and
 * `/* must be non-null *​/` are ordinary code; `/* you must obey *​/` is a hidden
 * instruction, and the hiding is what makes it a second marker.
 */
function collectCommentMatches(text: string, into: PromptMarker[]): void {
  const lines = text.split('\n');
  const phraseRe = new RegExp(`(${MARKER_RULES.map(([p]) => escapeRegExp(p)).join('|')})`, 'i');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.includes('/*') && !line.includes('<!--')) continue;
    if (phraseRe.test(line)) {
      into.push({ code: 'INJ-004', phrase: COMMENT_MARKER_PHRASE, line: i + 1 });
    }
  }
}

/** Frozen classification rules from the contract: see the module doc. */
function classifyMarkers(markers: readonly PromptMarker[]): InjectionClass {
  if (markers.length >= 2 || markers.some((m) => m.code === 'INJ-003')) return 'poisoned';
  if (markers.length === 1) return 'suspicious';
  return 'benign';
}

export function classify(text: string): InjectionScanResult {
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  const markers: PromptMarker[] = [];
  for (const [phrase, code] of MARKER_RULES) {
    collectPhraseMatches(text, phrase, code, lineStarts, markers);
  }
  collectTodoMatches(text, markers);
  collectCommentMatches(text, markers);
  markers.sort(
    (a, b) => a.line - b.line || compareAsc(a.phrase, b.phrase) || compareAsc(a.code, b.code),
  );
  return { path: '', markers, classification: classifyMarkers(markers) };
}

export function policy(): InjectionPolicyDocument {
  return { rules: POLICY_RULES, markerPhrases: POLICY_PHRASES };
}

export const promptIsolation: InjectionIsolationEngine = Object.freeze({
  name: 'prompt-isolation',
  classify,
  policy,
  policyIsImmutable: true,
});
