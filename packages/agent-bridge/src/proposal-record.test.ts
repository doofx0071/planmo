import { describe, expect, it } from 'vitest';
import type { AiProposal } from '@planmo/schema';
import {
  PROPOSALS_DIR,
  proposalRecordPath,
  proposalSlug,
  renderProposalRecord,
  validateProposal,
} from './proposal.js';

/**
 * A proposal's `requestId` is free text written by an agent, and it becomes a
 * filename. These tests exist because that is a path-traversal sink: the slug is
 * what stands between an agent's string and the filesystem.
 */
describe('proposalSlug', () => {
  it('slugs a normal request id', () => {
    expect(proposalSlug('Add planmo next to the command surface')).toBe(
      'add-planmo-next-to-the-command-surface',
    );
  });

  it('lowercases and collapses punctuation', () => {
    expect(proposalSlug('Fix: CLI   surface!!')).toBe('fix-cli-surface');
  });

  it('trims leading and trailing separators', () => {
    expect(proposalSlug('  --hello--  ')).toBe('hello');
  });

  it('caps the length', () => {
    expect(proposalSlug('a'.repeat(200))).toHaveLength(64);
  });

  it('never ends a truncated slug with a separator', () => {
    // 63 chars of payload then a separator: truncation must not leave the dash.
    expect(proposalSlug(`${'a'.repeat(63)} tail`)).toBe('a'.repeat(63));
  });

  it('falls back to a name when nothing usable remains', () => {
    expect(proposalSlug('')).toBe('proposal');
    expect(proposalSlug('   ')).toBe('proposal');
    expect(proposalSlug('!!!')).toBe('proposal');
    expect(proposalSlug('..')).toBe('proposal');
  });

  it('is deterministic', () => {
    expect(proposalSlug('Same Request')).toBe(proposalSlug('Same Request'));
  });
});

describe('proposalRecordPath', () => {
  it('places the record under the proposals directory', () => {
    expect(proposalRecordPath('Add planmo next')).toBe(`${PROPOSALS_DIR}/add-planmo-next.json`);
  });

  it('cannot escape its directory, whatever the request id', () => {
    const hostile = [
      '../../etc/passwd',
      '..\\..\\windows\\system32',
      'a/../../b',
      '/absolute/path',
      'C:\\Windows\\System32',
      '....',
      'a\u0000b',
      '~/secrets',
      '   ',
      '',
    ];

    for (const requestId of hostile) {
      const path = proposalRecordPath(requestId);
      expect(path.startsWith(`${PROPOSALS_DIR}/`), requestId).toBe(true);
      // Exactly one separator: the one after the directory.
      expect(path.slice(PROPOSALS_DIR.length + 1), requestId).not.toContain('/');
      expect(path, requestId).not.toContain('..');
      expect(path, requestId).not.toContain('\\');
      expect(path.endsWith('.json'), requestId).toBe(true);
    }
  });
});

describe('renderProposalRecord', () => {
  /** The fixture must validate; throw loudly if it ever stops. */
  function mustValidate(raw: unknown): AiProposal {
    const result = validateProposal(raw);
    if (!result.ok || result.proposal === undefined) throw new Error('fixture must validate');
    return result.proposal;
  }

  const proposal = mustValidate({
    schemaVersion: 1,
    agent: 'opencode',
    requestId: 'Add planmo next',
    items: [{ id: 'cli-surface', summary: 'Wire the next command.' }],
  });

  it('records a validated proposal as readable JSON', () => {
    const text = renderProposalRecord(proposal);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toMatchObject({ agent: 'opencode', requestId: 'Add planmo next' });
  });

  it('applies schema defaults, so the record is the normalised proposal', () => {
    const parsed = JSON.parse(renderProposalRecord(proposal)) as {
      items: { status: string; references: string[] }[];
    };
    expect(parsed.items[0]?.status).toBe('proposed');
    expect(parsed.items[0]?.references).toEqual([]);
  });

  it('is deterministic and carries no timestamp', () => {
    const text = renderProposalRecord(proposal);
    expect(text).toBe(renderProposalRecord(proposal));
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('rejects a proposal carrying an unknown key', () => {
    const result = validateProposal({
      schemaVersion: 1,
      agent: 'opencode',
      requestId: 'r',
      items: [],
      execute: 'rm -rf /',
    });
    expect(result.ok).toBe(false);
  });
});
