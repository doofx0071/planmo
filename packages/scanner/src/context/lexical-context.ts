/**
 * P10-09 local lexical context index (Worker B, CHG-001).
 *
 * Per-file identifier histogram plus doc-marker extraction, fully
 * deterministic over file texts passed by the caller (POSIX-relative key,
 * file order sorted by key). Tokenization: the global regex
 * `[A-Za-z_][A-Za-z0-9_]*` (slashes elided here to keep this doc comment a
 * comment) minus a fixed stopword set; counted case-sensitively. Tokens are
 * sorted count desc, then token asc, capped at 512 per file. Markers
 * TODO/FIXME/HACK are matched case-insensitively on word boundaries and
 * emitted uppercase, deduplicated and sorted. Pure: no fs, no clock, no
 * randomness.
 */
import type { LexicalContextEngine, LexicalToken } from '../contracts.js';

const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'or', 'of', 'to', 'in', 'for',
  'is', 'are', 'be', 'was', 'were',
  'it', 'this', 'that', 'with', 'on', 'at', 'by', 'from', 'as',
]);

const IDENTIFIER_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
const MARKER_RE = /\b(TODO|FIXME|HACK)\b/gi;

/** Hard cap on distinct tokens reported per file. */
export const MAX_TOKENS_PER_FILE = 512;

function byCountDescThenTokenAsc(a: LexicalToken, b: LexicalToken): number {
  return (
    (b.count - a.count) ||
    (a.token < b.token ? -1 : a.token > b.token ? 1 : 0)
  );
}

function indexFile(file: string, content: string): {
  file: string;
  tokens: LexicalToken[];
  markers: string[];
} {
  const counts = new Map<string, number>();
  for (const match of content.matchAll(IDENTIFIER_RE)) {
    const token = match[0];
    if (STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const tokens = [...counts.entries()]
    .map(([token, count]): LexicalToken => ({ token, count }))
    .sort(byCountDescThenTokenAsc)
    .slice(0, MAX_TOKENS_PER_FILE);

  const markerSet = new Set<string>();
  for (const match of content.matchAll(MARKER_RE)) {
    markerSet.add(match[0].toUpperCase());
  }
  const markers = [...markerSet].sort();

  return { file, tokens, markers };
}

export const lexicalContext: LexicalContextEngine = {
  name: 'lexical-context',

  async index(
    files: ReadonlyMap<string, string>,
  ): Promise<readonly { file: string; tokens: LexicalToken[]; markers: string[] }[]> {
    const entries = [...files.entries()].map(([file, content]) => indexFile(file, content));
    entries.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
    return entries;
  },
};