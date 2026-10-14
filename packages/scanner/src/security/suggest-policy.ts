/**
 * Pure, deterministic safety filters for consent-gated suggestion context.
 * Content matching is heuristic defense-in-depth; it cannot find every secret.
 */

export type SuggestionRedactionResult = {
  content: string;
  redactionCount: number;
};

const EXAMPLE_SUFFIXES = Object.freeze(['.example', '.sample', '.template']);
const CREDENTIAL_DIRECTORIES = new Set([
  'credentials',
  'secrets',
  '.ssh',
  '.aws',
  '.azure',
  '.gcloud',
  '.kube',
  '.docker',
  '.gnupg',
]);
const CONFIG_CREDENTIAL_DIRECTORIES = new Set(['gcloud', 'aws', 'azure', 'gh']);
const PRIVATE_KEY_BASENAMES = new Set([
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'id_dsa',
  'identity',
  'private_key',
  'private-key',
]);
const PRIVATE_MATERIAL_SUFFIXES = Object.freeze([
  '.pem',
  '.key',
  '.p8',
  '.pkcs8',
  '.p12',
  '.pfx',
  '.p7b',
  '.p7c',
  '.p7m',
  '.p7s',
  '.ppk',
  '.crt',
  '.cer',
  '.cert',
  '.der',
  '.jks',
  '.keystore',
  '.asc',
]);
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;

function isValidPosixRelativePath(path: string): boolean {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    WINDOWS_DRIVE_PREFIX.test(path) ||
    CONTROL_CHARACTERS.test(path)
  ) {
    return false;
  }

  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function hasExplicitExampleSuffix(filename: string): boolean {
  return EXAMPLE_SUFFIXES.some((suffix) => filename.endsWith(suffix));
}

/**
 * Returns true when a POSIX repo-relative path must not enter suggestion context.
 * Invalid, absolute, traversal-like, or non-canonical paths are excluded.
 * This function only inspects the supplied string; it never reads the path.
 */
export function isSuggestionExcludedPath(path: string): boolean {
  if (!isValidPosixRelativePath(path)) return true;

  const segments = path.split('/');
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  if (lowerSegments.some((segment) => CREDENTIAL_DIRECTORIES.has(segment))) return true;

  for (let index = 0; index < lowerSegments.length - 1; index++) {
    if (
      lowerSegments[index] === '.config' &&
      CONFIG_CREDENTIAL_DIRECTORIES.has(lowerSegments[index + 1]!)
    ) {
      return true;
    }
  }

  const filename = lowerSegments[lowerSegments.length - 1]!;
  if (filename.startsWith('.env') && !hasExplicitExampleSuffix(filename)) return true;
  if (filename.startsWith('.npmrc') && !hasExplicitExampleSuffix(filename)) return true;
  if (filename === 'auth.json' || PRIVATE_KEY_BASENAMES.has(filename)) return true;
  return PRIVATE_MATERIAL_SUFFIXES.some((suffix) => filename.endsWith(suffix));
}

const REDACTION_MARKER = '[REDACTED]';
const CREDENTIAL_FIELD_SUFFIXES = Object.freeze([
  'apikey',
  'apisecret',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'secretaccesskey',
  'secretkey',
  'secret',
  'password',
  'passwd',
  'token',
  'credentials',
  'credential',
  'authorization',
  'auth',
  'privatekey',
]);
const PEM_BEGIN_PREFIX = '-----BEGIN ';
const PEM_END_PREFIX = '-----END ';
// shortcut: declarations with longer types redact the rest of the line; widen only for real syntax needs.
const MAX_TYPED_DECLARATION_LOOKAHEAD = 256;
const BEARER_TOKEN_RE = /\b(Bearer|Basic)([ \t]+)([A-Za-z0-9._~+\/\-]+=*)/gi;
// shortcut: JWT shapes are scanned linearly by redactJwtShapes; a regex branch here
// retries a long second segment for every repeated "eyJ" candidate (quadratic).
const API_TOKEN_SHAPES = String.raw`sk-(?:proj-|ant-|or-v1-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|npm_[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20,}|ya29\.[A-Za-z0-9_-]{16,}`;
const API_TOKEN_RE = new RegExp(
  String.raw`(^|[^A-Za-z0-9])(${API_TOKEN_SHAPES})(?![A-Za-z0-9])`,
  'g',
);
const JWT_MIN_SEGMENT_LENGTH = 8;

function redactPreservingLineBreaks(value: string): string {
  let insertedMarker = false;
  let previousTerminatorWasLoneCarriageReturn = false;
  let markerAfterLoneCarriageReturn = false;
  const result: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (character === '\r' && value[index + 1] === '\n') {
      result.push('\r\n');
      index++;
      previousTerminatorWasLoneCarriageReturn = false;
      markerAfterLoneCarriageReturn = false;
    } else if (character === '\r' || character === '\n') {
      // Keep originally distinct CR and LF tokens from becoming one CRLF.
      if (
        character === '\n' &&
        previousTerminatorWasLoneCarriageReturn &&
        !markerAfterLoneCarriageReturn
      ) {
        result.push(REDACTION_MARKER);
      }
      result.push(character);
      previousTerminatorWasLoneCarriageReturn = character === '\r';
      markerAfterLoneCarriageReturn = false;
    } else if (!insertedMarker) {
      result.push(REDACTION_MARKER);
      insertedMarker = true;
      markerAfterLoneCarriageReturn = previousTerminatorWasLoneCarriageReturn;
    }
  }
  return result.join('');
}

function isAsciiLetterOrDigit(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

function isCredentialFieldCharacter(character: string): boolean {
  return isAsciiLetterOrDigit(character) || character === '_' || character === '-';
}

function isCredentialWordCharacter(character: string): boolean {
  return isAsciiLetterOrDigit(character) || character === '_';
}

function isCredentialField(field: string): boolean {
  const normalized = field.replace(/[_-]/g, '').toLowerCase();
  return CREDENTIAL_FIELD_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

type CredentialFieldCandidate = {
  end: number;
};

function readQuotedCredentialField(
  content: string,
  start: number,
): CredentialFieldCandidate | undefined {
  const quote = content[start]!;
  let cursor = start + 1;
  while (cursor < content.length && isCredentialFieldCharacter(content[cursor]!)) cursor++;
  if (cursor === start + 1 || content[cursor] !== quote) return undefined;

  const field = content.slice(start + 1, cursor);
  return isCredentialField(field) ? { end: cursor + 1 } : undefined;
}

type TypedEqualsScan =
  { kind: 'found'; equalsIndex: number } | { kind: 'overflow' } | { kind: 'missing' };

function isTypeStartCharacter(character: string): boolean {
  return (
    (isAsciiLetterOrDigit(character) && !isAsciiDigit(character)) ||
    character === '_' ||
    character === '$' ||
    character === '*' ||
    character === '['
  );
}

function isAsciiDigit(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 0x30 && code <= 0x39;
}

function isTypeCharacter(character: string): boolean {
  return (
    isAsciiLetterOrDigit(character) ||
    character === '_' ||
    character === '$' ||
    character === '.' ||
    character === '*' ||
    character === '[' ||
    character === ']' ||
    character === '{' ||
    character === '}' ||
    character === '<' ||
    character === '>' ||
    character === '|' ||
    character === '&' ||
    character === '?' ||
    character === ',' ||
    character === ' ' ||
    character === '\t' ||
    character === '(' ||
    character === ')'
  );
}

function scanTypedEquals(content: string, start: number): TypedEqualsScan {
  if (start >= content.length || !isTypeStartCharacter(content[start]!)) {
    return { kind: 'missing' };
  }

  let cursor = start;
  let inspected = 0;
  while (cursor < content.length) {
    const character = content[cursor]!;
    if (character === '=') return { kind: 'found', equalsIndex: cursor };
    if (character === '\r' || character === '\n' || !isTypeCharacter(character)) {
      return { kind: 'missing' };
    }
    if (inspected === MAX_TYPED_DECLARATION_LOOKAHEAD) return { kind: 'overflow' };
    inspected++;
    cursor++;
  }

  return { kind: 'missing' };
}

function skipHorizontalWhitespace(content: string, start: number): number {
  let cursor = start;
  while (content[cursor] === ' ' || content[cursor] === '\t') cursor++;
  return cursor;
}

type CredentialAssignment = {
  valueStart: number;
};

function readCredentialAssignment(
  content: string,
  fieldEnd: number,
): CredentialAssignment | undefined {
  const operatorIndex = skipHorizontalWhitespace(content, fieldEnd);
  const operator = content[operatorIndex];

  if (operator === '=') {
    return { valueStart: skipHorizontalWhitespace(content, operatorIndex + 1) };
  }

  if (operator === ':') {
    if (content[operatorIndex + 1] === '=') {
      return { valueStart: skipHorizontalWhitespace(content, operatorIndex + 2) };
    }

    const typedStart = skipHorizontalWhitespace(content, operatorIndex + 1);
    const typedEquals = scanTypedEquals(content, typedStart);
    if (typedEquals.kind === 'found') {
      return { valueStart: skipHorizontalWhitespace(content, typedEquals.equalsIndex + 1) };
    }
    return { valueStart: typedStart };
  }

  if (operatorIndex > fieldEnd) {
    const typedEquals = scanTypedEquals(content, operatorIndex);
    if (typedEquals.kind === 'found') {
      return { valueStart: skipHorizontalWhitespace(content, typedEquals.equalsIndex + 1) };
    }
    // A recognized credential field followed by a type form we cannot scan
    // (overflow, composite literal, or unsupported syntax) fails closed.
    if (isTypeStartCharacter(content[operatorIndex]!)) {
      return { valueStart: operatorIndex };
    }
  }

  return undefined;
}

type ScannedCredentialValue = {
  end: number;
  text: string;
  replacement: string;
};

function scanTripleQuotedValue(
  content: string,
  start: number,
  delimiter: string,
): ScannedCredentialValue {
  let escaped = false;
  let closeStart = content.length;
  let closed = false;

  for (let cursor = start + 3; cursor < content.length; cursor++) {
    if (content.startsWith(delimiter, cursor)) {
      if (!escaped) {
        closeStart = cursor;
        closed = true;
        break;
      }
      cursor += delimiter.length - 1;
      escaped = false;
      continue;
    }

    const character = content[cursor]!;
    escaped = character === '\\' ? !escaped : false;
  }

  const text = content.slice(start + 3, closeStart);
  const end = closed ? closeStart + 3 : content.length;
  return {
    end,
    text,
    replacement: `${delimiter}${redactPreservingLineBreaks(text)}${closed ? delimiter : ''}`,
  };
}

function findQuotedValueClose(content: string, start: number, quote: string): number | undefined {
  for (let cursor = start + 1; cursor < content.length;) {
    const character = content[cursor]!;
    if (character === '\\') {
      cursor++;
      if (cursor >= content.length) return undefined;
      if (content[cursor] === '\r' && content[cursor + 1] === '\n') {
        cursor += 2;
      } else {
        cursor++;
      }
      continue;
    }
    if (character === quote) return cursor;
    cursor++;
  }

  return undefined;
}

type TemplateFrame = { kind: 'template' } | { kind: 'expression'; braceDepth: number };

type TemplateClose = {
  closeStart: number;
  end: number;
  closed: boolean;
};

function findTemplateClose(content: string, start: number): TemplateClose {
  const frames: TemplateFrame[] = [{ kind: 'template' }];

  for (let cursor = start + 1; cursor < content.length;) {
    const frame = frames[frames.length - 1]!;
    const character = content[cursor]!;

    if (frame.kind === 'template') {
      if (character === '\\') {
        cursor++;
        if (cursor < content.length) {
          if (content[cursor] === '\r' && content[cursor + 1] === '\n') {
            cursor += 2;
          } else {
            cursor++;
          }
        }
        continue;
      }

      if (character === '`') {
        frames.pop();
        if (frames.length === 0) return { closeStart: cursor, end: cursor + 1, closed: true };
        cursor++;
        continue;
      }

      if (character === '$' && content[cursor + 1] === '{') {
        frames.push({ kind: 'expression', braceDepth: 1 });
        cursor += 2;
        continue;
      }

      cursor++;
      continue;
    }

    if (character === '"' || character === "'") {
      const quoteClose = findQuotedValueClose(content, cursor, character);
      if (quoteClose === undefined) {
        return { closeStart: content.length, end: content.length, closed: false };
      }
      cursor = quoteClose + 1;
      continue;
    }

    if (character === '/') {
      if (content[cursor + 1] === '/') {
        cursor += 2;
        while (cursor < content.length && content[cursor] !== '\r' && content[cursor] !== '\n') {
          cursor++;
        }
        continue;
      }
      if (content[cursor + 1] === '*') {
        const commentEnd = content.indexOf('*/', cursor + 2);
        if (commentEnd < 0) {
          return { closeStart: content.length, end: content.length, closed: false };
        }
        cursor = commentEnd + 2;
        continue;
      }

      // shortcut: regex literals mask through EOF; add a regex lexer to accept slash expressions.
      return { closeStart: content.length, end: content.length, closed: false };
    }

    if (character === '`') {
      frames.push({ kind: 'template' });
      cursor++;
      continue;
    }

    if (character === '{') {
      frame.braceDepth++;
      cursor++;
      continue;
    }

    if (character === '}') {
      frame.braceDepth--;
      cursor++;
      if (frame.braceDepth === 0) frames.pop();
      continue;
    }

    cursor++;
  }

  return { closeStart: content.length, end: content.length, closed: false };
}

function findLineEnd(content: string, start: number): number {
  let end = start;
  while (end < content.length && content[end] !== '\r' && content[end] !== '\n') end++;
  return end;
}

// shortcut: `+`, `||` and `??` continue the assigned expression, so a redacted
// first operand cannot leave a concatenated tail in the clear.
function continuesAssignedExpression(content: string, cursor: number): boolean {
  const operatorStart = skipHorizontalWhitespace(content, cursor);
  const first = content[operatorStart];
  if (first === '+') return true;
  if (first === '|' && content[operatorStart + 1] === '|') return true;
  if (first === '?' && content[operatorStart + 1] === '?') return true;
  return false;
}

function redactToLineEnd(content: string, start: number): ScannedCredentialValue {
  const end = findLineEnd(content, start);
  const text = content.slice(start, end);
  return { end, text, replacement: redactPreservingLineBreaks(text) };
}

// Redacts a complete assigned expression: from its first operand through the end
// of the line that carries the final continuation.
function redactAssignedExpression(
  content: string,
  start: number,
  operandEnd: number,
): ScannedCredentialValue {
  const end = findLineEnd(content, operandEnd);
  const text = content.slice(start, end);
  return { end, text, replacement: redactPreservingLineBreaks(text) };
}

function countLeadingIndent(content: string, lineStart: number): number {
  let cursor = lineStart;
  while (content[cursor] === ' ' || content[cursor] === '\t') cursor++;
  return cursor - lineStart;
}

// A YAML block scalar header: `|` or `>` with optional chomping/indentation
// indicators, optionally followed by a comment.
function isBlockScalarIndicator(content: string, start: number): boolean {
  const first = content[start];
  if (first !== '|' && first !== '>') return false;

  let cursor = start + 1;
  let sawIndentDigit = false;
  while (cursor < content.length) {
    const character = content[cursor]!;
    if (character === '+' || character === '-') {
      cursor++;
      continue;
    }
    if (character >= '1' && character <= '9') {
      if (sawIndentDigit) return false;
      sawIndentDigit = true;
      cursor++;
      continue;
    }
    break;
  }

  cursor = skipHorizontalWhitespace(content, cursor);
  if (cursor >= content.length) return true;
  const terminator = content[cursor]!;
  if (terminator === '\r' || terminator === '\n') return true;
  return terminator === '#';
}

// Redacts a whole block scalar: its header plus every following line that is
// blank or indented deeper than the key. Stops before the first shallower line.
function scanBlockScalarValue(content: string, start: number): ScannedCredentialValue {
  let lineStart = start;
  while (lineStart > 0 && content[lineStart - 1] !== '\r' && content[lineStart - 1] !== '\n') {
    lineStart--;
  }
  const keyIndent = countLeadingIndent(content, lineStart);

  let end = findLineEnd(content, start);
  let cursor = end;
  while (cursor < content.length) {
    const terminatorLength = content[cursor] === '\r' && content[cursor + 1] === '\n' ? 2 : 1;
    const nextLineStart = cursor + terminatorLength;
    const nextLineEnd = findLineEnd(content, nextLineStart);
    const line = content.slice(nextLineStart, nextLineEnd);
    const blank = line.trim().length === 0;
    if (!blank && countLeadingIndent(content, nextLineStart) <= keyIndent) break;
    if (nextLineEnd >= content.length) {
      end = content.length;
    } else {
      end =
        content[nextLineEnd] === '\r' && content[nextLineEnd + 1] === '\n'
          ? nextLineEnd + 2
          : nextLineEnd + 1;
    }
    cursor = nextLineEnd;
  }

  const text = content.slice(start, end);
  return { end, text, replacement: redactPreservingLineBreaks(text) };
}

function scanCredentialValue(content: string, start: number): ScannedCredentialValue | undefined {
  if (start >= content.length || content[start] === '\r' || content[start] === '\n') {
    return undefined;
  }

  const first = content[start]!;

  if (isBlockScalarIndicator(content, start)) {
    return scanBlockScalarValue(content, start);
  }

  if ((first === '"' || first === "'") && content.startsWith(first.repeat(3), start)) {
    const triple = scanTripleQuotedValue(content, start, first.repeat(3));
    if (triple.end < content.length && continuesAssignedExpression(content, triple.end)) {
      return redactAssignedExpression(content, start, triple.end);
    }
    return triple;
  }

  if (first === '"' || first === "'") {
    const closeStart = findQuotedValueClose(content, start, first);
    const closed = closeStart !== undefined;
    const textEnd = closeStart ?? content.length;
    const text = content.slice(start + 1, textEnd);

    if (closed && continuesAssignedExpression(content, textEnd + 1)) {
      return redactAssignedExpression(content, start, textEnd + 1);
    }

    return {
      end: closed ? textEnd + 1 : content.length,
      text,
      replacement: `${first}${redactPreservingLineBreaks(text)}${closed ? first : ''}`,
    };
  }

  if (first === '`') {
    const close = findTemplateClose(content, start);
    if (
      close.closed &&
      close.end < content.length &&
      continuesAssignedExpression(content, close.end)
    ) {
      return redactAssignedExpression(content, start, close.end);
    }
    const text = content.slice(start + 1, close.closeStart);
    return {
      end: close.end,
      text,
      replacement: `\`${redactPreservingLineBreaks(text)}${close.closed ? '`' : ''}`,
    };
  }

  return redactToLineEnd(content, start);
}

function hasCredentialValue(value: string): boolean {
  return value.replaceAll(REDACTION_MARKER, '').trim().length > 0;
}

function redactCredentialAssignments(content: string): {
  content: string;
  redactionCount: number;
} {
  const replacements: string[] = [];
  let redactionCount = 0;
  let outputCursor = 0;
  let cursor = 0;

  while (cursor < content.length) {
    let fieldEnd: number;

    if (content[cursor] === '"' || content[cursor] === "'") {
      const candidate = readQuotedCredentialField(content, cursor);
      if (candidate === undefined) {
        cursor++;
        continue;
      }
      fieldEnd = candidate.end;
    } else if (isCredentialWordCharacter(content[cursor]!)) {
      if (cursor > 0 && isCredentialWordCharacter(content[cursor - 1]!)) {
        cursor++;
        continue;
      }

      fieldEnd = cursor;
      while (fieldEnd < content.length && isCredentialFieldCharacter(content[fieldEnd]!)) {
        fieldEnd++;
      }
      if (!isCredentialField(content.slice(cursor, fieldEnd))) {
        cursor = fieldEnd;
        continue;
      }
    } else {
      cursor++;
      continue;
    }

    const assignment = readCredentialAssignment(content, fieldEnd);
    if (assignment === undefined) {
      cursor = fieldEnd;
      continue;
    }

    const value = scanCredentialValue(content, assignment.valueStart);
    if (value === undefined) {
      cursor = assignment.valueStart;
      continue;
    }

    if (!hasCredentialValue(value.text)) {
      cursor = value.end;
      continue;
    }

    replacements.push(content.slice(outputCursor, assignment.valueStart), value.replacement);
    outputCursor = value.end;
    cursor = value.end;
    redactionCount++;
  }

  if (redactionCount === 0) return { content, redactionCount };
  replacements.push(content.slice(outputCursor));
  return { content: replacements.join(''), redactionCount };
}

function isJwtSegmentCharacter(character: string): boolean {
  return isAsciiLetterOrDigit(character) || character === '_' || character === '-';
}

/**
 * Redacts JWT-shaped tokens (`eyJ<seg>.<seg>.<seg>`) in a single linear pass.
 * A regex alternative here backtracks over the second segment once per repeated
 * `eyJ` candidate, which is quadratic on adversarial input.
 */
function redactJwtShapes(content: string): { content: string; redactionCount: number } {
  const runLengths = new Int32Array(content.length + 1);
  for (let index = content.length - 1; index >= 0; index--) {
    runLengths[index] = isJwtSegmentCharacter(content[index]!) ? runLengths[index + 1]! + 1 : 0;
  }

  const replacements: string[] = [];
  let redactionCount = 0;
  let outputCursor = 0;
  let cursor = 0;

  while (cursor < content.length) {
    const candidate = content.indexOf('eyJ', cursor);
    if (candidate < 0) break;
    cursor = candidate + 1;

    if (candidate > 0 && isAsciiLetterOrDigit(content[candidate - 1]!)) continue;

    const firstSegmentLength = runLengths[candidate]!;
    if (firstSegmentLength < 3 + JWT_MIN_SEGMENT_LENGTH) continue;
    const firstSegmentEnd = candidate + firstSegmentLength;
    if (content[firstSegmentEnd] !== '.') continue;

    const secondSegmentStart = firstSegmentEnd + 1;
    if (secondSegmentStart >= content.length) continue;
    const secondSegmentLength = runLengths[secondSegmentStart]!;
    if (secondSegmentLength < JWT_MIN_SEGMENT_LENGTH) continue;
    const secondSegmentEnd = secondSegmentStart + secondSegmentLength;
    if (content[secondSegmentEnd] !== '.') continue;

    const thirdSegmentStart = secondSegmentEnd + 1;
    if (thirdSegmentStart >= content.length) continue;
    const thirdSegmentLength = runLengths[thirdSegmentStart]!;
    if (thirdSegmentLength < JWT_MIN_SEGMENT_LENGTH) continue;
    const tokenEnd = thirdSegmentStart + thirdSegmentLength;
    if (tokenEnd < content.length && isAsciiLetterOrDigit(content[tokenEnd]!)) continue;

    replacements.push(content.slice(outputCursor, candidate), REDACTION_MARKER);
    outputCursor = tokenEnd;
    cursor = tokenEnd;
    redactionCount++;
  }

  if (redactionCount === 0) return { content, redactionCount: 0 };
  replacements.push(content.slice(outputCursor));
  return { content: replacements.join(''), redactionCount };
}

function matchesAsciiCaseInsensitiveAt(content: string, start: number, value: string): boolean {
  if (start + value.length > content.length) return false;
  for (let offset = 0; offset < value.length; offset++) {
    let code = content.charCodeAt(start + offset);
    if (code >= 0x61 && code <= 0x7a) code -= 0x20;
    if (code !== value.charCodeAt(offset)) return false;
  }
  return true;
}

function findAsciiCaseInsensitive(content: string, value: string, start: number): number {
  const lastStart = content.length - value.length;
  for (let cursor = start; cursor <= lastStart; cursor++) {
    if (matchesAsciiCaseInsensitiveAt(content, cursor, value)) return cursor;
  }
  return -1;
}

function isPrivateKeyLabel(label: string): boolean {
  const pgpLabel = 'PGP PRIVATE KEY BLOCK';
  if (label.length === pgpLabel.length && matchesAsciiCaseInsensitiveAt(label, 0, pgpLabel)) {
    return true;
  }

  const suffix = 'PRIVATE KEY';
  const prefixLength = label.length - suffix.length;
  if (prefixLength < 0 || !matchesAsciiCaseInsensitiveAt(label, prefixLength, suffix)) return false;
  if (prefixLength === 0) return true;
  if (label[prefixLength - 1] !== ' ') return false;

  const wordsEnd = prefixLength - 1;
  if (wordsEnd === 0) return false;
  let currentWordLength = 0;
  for (let cursor = 0; cursor < wordsEnd; cursor++) {
    const character = label[cursor]!;
    if (character === ' ') {
      if (currentWordLength === 0) return false;
      currentWordLength = 0;
    } else if (isAsciiLetterOrDigit(character)) {
      currentWordLength++;
    } else {
      return false;
    }
  }
  return currentWordLength > 0;
}

type PemMarker = {
  start: number;
  end: number;
  label: string;
  // A recognized private-key label whose header line never closes with dashes:
  // the structure cannot be trusted, so the block is redacted through EOF.
  malformed: boolean;
};

type PemMarkerParse = { marker: PemMarker } | { nextIndex: number };

function parsePrivateKeyMarker(content: string, start: number, prefix: string): PemMarkerParse {
  const labelStart = start + prefix.length;
  for (let cursor = labelStart; cursor < content.length; cursor++) {
    const character = content[cursor]!;
    if (character === '\r' || character === '\n') {
      const label = content.slice(labelStart, cursor);
      if (isPrivateKeyLabel(label)) {
        return { marker: { start, end: cursor, label, malformed: true } };
      }
      return {
        nextIndex: character === '\r' && content[cursor + 1] === '\n' ? cursor + 2 : cursor + 1,
      };
    }
    if (!content.startsWith('-----', cursor)) continue;

    const label = content.slice(labelStart, cursor);
    if (isPrivateKeyLabel(label)) {
      return { marker: { start, end: cursor + 5, label, malformed: false } };
    }
    return { nextIndex: cursor };
  }

  const trailingLabel = content.slice(labelStart);
  if (isPrivateKeyLabel(trailingLabel)) {
    return { marker: { start, end: content.length, label: trailingLabel, malformed: true } };
  }
  return { nextIndex: content.length };
}

function findPrivateKeyMarker(
  content: string,
  start: number,
  kind: 'BEGIN' | 'END',
  matchingLabel?: string,
): PemMarker | undefined {
  const prefix = kind === 'BEGIN' ? PEM_BEGIN_PREFIX : PEM_END_PREFIX;
  let cursor = start;
  while (cursor < content.length) {
    const markerStart = findAsciiCaseInsensitive(content, prefix, cursor);
    if (markerStart < 0) return undefined;

    const parsed = parsePrivateKeyMarker(content, markerStart, prefix);
    if ('marker' in parsed) {
      if (
        matchingLabel === undefined ||
        parsed.marker.label.toUpperCase() === matchingLabel.toUpperCase()
      ) {
        return parsed.marker;
      }
      cursor = parsed.marker.end;
      continue;
    }
    cursor = Math.max(markerStart + prefix.length, parsed.nextIndex);
  }

  return undefined;
}

function redactPrivateKeyBlocks(content: string): { content: string; redactionCount: number } {
  const replacements: string[] = [];
  let redactionCount = 0;
  let outputCursor = 0;
  let searchCursor = 0;

  while (searchCursor < content.length) {
    const begin = findPrivateKeyMarker(content, searchCursor, 'BEGIN');
    if (begin === undefined) break;

    const end = begin.malformed
      ? undefined
      : findPrivateKeyMarker(content, begin.end, 'END', begin.label);
    const blockEnd = end?.end ?? content.length;
    replacements.push(
      content.slice(outputCursor, begin.start),
      redactPreservingLineBreaks(content.slice(begin.start, blockEnd)),
    );
    outputCursor = blockEnd;
    searchCursor = blockEnd;
    redactionCount++;

    if (end === undefined) break;
  }

  if (redactionCount === 0) return { content, redactionCount };
  replacements.push(content.slice(outputCursor));
  return { content: replacements.join(''), redactionCount };
}

/**
 * Redacts common credential assignments, recognizable token shapes, and PEM
 * private-key blocks. It preserves the original CR/LF terminator sequence so
 * evidence line ranges remain stable. This heuristic is not a guarantee that
 * every secret is found.
 */
export function redactSuggestionContent(content: string): SuggestionRedactionResult {
  let redactionCount = 0;
  const privateKeys = redactPrivateKeyBlocks(content);
  redactionCount += privateKeys.redactionCount;

  const assignments = redactCredentialAssignments(privateKeys.content);
  redactionCount += assignments.redactionCount;

  const withoutBearerTokens = assignments.content.replace(
    BEARER_TOKEN_RE,
    (_match, scheme: string, separator: string) => {
      redactionCount++;
      return `${scheme}${separator}${REDACTION_MARKER}`;
    },
  );
  const redactedContent = withoutBearerTokens.replace(API_TOKEN_RE, (_match, prefix: string) => {
    redactionCount++;
    return `${prefix}${REDACTION_MARKER}`;
  });

  const withoutJwtShapes = redactJwtShapes(redactedContent);
  redactionCount += withoutJwtShapes.redactionCount;

  return { content: withoutJwtShapes.content, redactionCount };
}
