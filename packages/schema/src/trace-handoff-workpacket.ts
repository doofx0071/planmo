import { z } from 'zod';
import { NonEmptyString, versionedObject } from './common.js';
import { CapabilityRef } from './pack-design.js';

/**
 * Trace graph, handoff, and work-packet schemas (P02-04).
 * Trace graph mirrors docs/02-architecture/canonical-project-model.md's
 * normalized subdocuments; the handoff mirrors planning/handoffs/TEMPLATE.md.
 */

// ---------------------------------------------------------------- trace graph

export const TRACE_LINK_KINDS = [
  'requirement',
  'decision',
  'risk',
  'task',
  'test',
  'artifact',
  'handoff',
] as const;
export type TraceLinkKind = (typeof TRACE_LINK_KINDS)[number];

export const TraceLink = z.strictObject({
  id: NonEmptyString,
  kind: z.enum(TRACE_LINK_KINDS),
  /** Source node id, e.g. a requirement id like REQ-GEN-004. */
  from: NonEmptyString,
  /** Target node id, e.g. a task id like P05-03. */
  to: NonEmptyString,
  note: NonEmptyString.optional(),
});
export type TraceLink = z.infer<typeof TraceLink>;

export const TraceGraphSchema = versionedObject({
  links: z.array(TraceLink).default([]),
});
export type TraceGraph = z.infer<typeof TraceGraphSchema>;

// ------------------------------------------------------------------ handoff

export const HANDOFF_STATUSES = ['COMPLETE', 'PARTIAL', 'BLOCKED'] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export const HandoffBlocker = z.strictObject({
  task: NonEmptyString,
  reason: NonEmptyString,
  unblock: NonEmptyString.optional(),
});
export type HandoffBlocker = z.infer<typeof HandoffBlocker>;

export const HandoffTestRow = z.strictObject({
  command: NonEmptyString,
  result: z.enum(['PASS', 'FAIL', 'BLOCKED']),
  notes: NonEmptyString.optional(),
});
export type HandoffTestRow = z.infer<typeof HandoffTestRow>;

export const HandoffSchema = versionedObject({
  phase: NonEmptyString,
  status: z.enum(HANDOFF_STATUSES),
  completedTasks: z.array(NonEmptyString).default([]),
  blocked: z.array(HandoffBlocker).default([]),
  /** Files/packages materially changed. */
  materialChanges: z.array(NonEmptyString).default([]),
  testsRun: z.array(HandoffTestRow).default([]),
  securityFindings: z.array(NonEmptyString).default([]),
  /** ADR filenames and decision-log entries created. */
  decisions: z.array(NonEmptyString).default([]),
  git: z
    .strictObject({
      branch: NonEmptyString.optional(),
      commits: z.array(NonEmptyString).optional(),
      pr: NonEmptyString.optional(),
    })
    .optional(),
  knownDebt: z.array(NonEmptyString).default([]),
  nextPhase: NonEmptyString,
  instructions: z.array(NonEmptyString).default([]),
});
export type HandoffDocument = z.infer<typeof HandoffSchema>;

// --------------------------------------------------------------- work packet

export const WORK_PACKET_STATUSES = ['planned', 'in-progress', 'blocked', 'done'] as const;
export type WorkPacketStatus = (typeof WORK_PACKET_STATUSES)[number];

/**
 * A unit of work handed to a parallel worker (Phase 08 parallel workers).
 * Self-contained: scope, inputs, outputs, dependencies — no hidden context.
 */
export const WorkPacketSchema = versionedObject({
  id: NonEmptyString,
  /** Owning tracking task id. */
  taskId: NonEmptyString,
  title: NonEmptyString,
  scope: NonEmptyString,
  /** Agent/adapter the packet is assigned to. */
  assignee: NonEmptyString.optional(),
  /** Input paths/refs. */
  inputs: z.array(NonEmptyString).default([]),
  /** Required output paths/refs. */
  outputs: z.array(NonEmptyString).default([]),
  /** Capabilities or packets that must be resolved first. */
  dependencies: z.array(CapabilityRef).default([]),
  status: z.enum(WORK_PACKET_STATUSES),
});
export type WorkPacket = z.infer<typeof WorkPacketSchema>;
