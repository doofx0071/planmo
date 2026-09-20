import { WorkPacketSchema } from '@planmo/schema';
import type { WorkPacket } from '@planmo/schema';
import type { CompilePacketsInput, OwnershipClaim, PacketCompiler } from './contracts.js';

/**
 * Parallel work packet compiler (P08-04).
 *
 * Produces one schema-valid WorkPacket per task id. Ownership metadata is
 * NON-OVERLAPPING by contract: two claims that share a path (exact match, or
 * a directory-prefix relationship after stripping a trailing '/**' glob) are
 * rejected loudly with a deterministic Error listing the offending
 * owner/path pairs — parallel workers must never collide.
 *
 * Packets are independent slices (dependencies = []); DAG ordering is the
 * job of task-dag.ts. Inputs are the shared context (sorted union of ALL
 * claimed paths), outputs are the paths claimed by the i-th claim for the
 * i-th task, and the assignee is the claim's owner.
 *
 * PURE + deterministic: every emitted array is sorted, no time, no I/O.
 */

const GLOB_SUFFIX = '/**';
const WINDOWS_GLOB_SUFFIX = '\\**';

/** Strip a trailing '/**' (or '\\**') glob; the residue is a directory prefix. */
function stripGlobSuffix(path: string): string {
  if (path.endsWith(GLOB_SUFFIX) || path.endsWith(WINDOWS_GLOB_SUFFIX)) {
    return path.slice(0, -3);
  }
  return path;
}

function isSeparator(char: string | undefined): boolean {
  return char === '/' || char === '\\';
}

/**
 * Prefix-overlap rule: two paths overlap when — after stripping a trailing
 * '/**' — they are identical, or one is a directory prefix of the other
 * (prefix ends exactly at a path separator, so 'packages/a/**' overlaps
 * 'packages/a/b.ts' but 'packages/a' does not overlap 'packages/ab').
 */
function pathsOverlap(a: string, b: string): boolean {
  const strippedA = stripGlobSuffix(a);
  const strippedB = stripGlobSuffix(b);
  if (strippedA === strippedB) return true;
  if (
    strippedA.length < strippedB.length &&
    strippedB.startsWith(strippedA) &&
    isSeparator(strippedB[strippedA.length])
  ) {
    return true;
  }
  if (
    strippedB.length < strippedA.length &&
    strippedA.startsWith(strippedB) &&
    isSeparator(strippedA[strippedB.length])
  ) {
    return true;
  }
  return false;
}

/** All overlapping (owner, path) pair descriptions, sorted deterministically. */
function overlappingClaims(claims: readonly OwnershipClaim[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const left = claims[i];
      const right = claims[j];
      if (left === undefined || right === undefined) continue;
      for (const leftPath of left.paths) {
        for (const rightPath of right.paths) {
          if (pathsOverlap(leftPath, rightPath)) {
            pairs.push(
              `"${left.owner}" path "${leftPath}" overlaps "${right.owner}" path "${rightPath}"`,
            );
          }
        }
      }
    }
  }
  return pairs.sort();
}

export function packetCompiler(): PacketCompiler {
  function compile(input: CompilePacketsInput): readonly WorkPacket[] {
    const overlaps = overlappingClaims(input.ownership);
    if (overlaps.length > 0) {
      throw new Error(`overlapping ownership claims: ${overlaps.join('; ')}`);
    }

    // Shared context: sorted union of every claimed path (same for all packets).
    const sharedInputs = [...new Set(input.ownership.flatMap((claim) => claim.paths))].sort();

    return input.taskIds.map((taskId, index) => {
      const claim = input.ownership[index];
      return WorkPacketSchema.parse({
        schemaVersion: 1,
        id: `WP-${taskId}`,
        taskId,
        title: input.titlePrefix ? `${input.titlePrefix} ${taskId}` : taskId,
        scope: `Own ${taskId}`,
        // i-th task pairs with the i-th ownership claim (deterministic zip).
        ...(claim === undefined ? {} : { assignee: claim.owner, outputs: [...claim.paths].sort() }),
        inputs: sharedInputs,
        dependencies: [],
        status: 'planned',
      });
    });
  }

  return { compile };
}
