import type { ContextView, PacketView } from '@planmo/adapters';
import type { PacketRenderer } from './providers.js';

/**
 * Execution Packet rendering (P06-11, CHG-001 REQ-WRK-001..003).
 *
 * Renders a WorkPacket + its context bundle into the self-contained block a
 * worker receives (per docs/15-change-governance/task-graph-execution-packets.md):
 * task + acceptance context, requirement links, applicable standards are
 * injected by the adapters; this renderer produces the packet+context view.
 *
 * Pure + deterministic: identical (packet, context) → identical text.
 */

/** Deterministic copy (never mutates the caller's array). */
function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

/** Render a work packet's self-contained execution block. */
export function renderExecutionPacket(packet: PacketView, context: ContextView): string {
  const lines: string[] = [
    '# Execution packet',
    `Packet: ${packet.id}`,
    `Task: ${packet.taskId}`,
    `Title: ${packet.title}`,
    `Scope: ${packet.scope}`,
  ];

  if (packet.inputs !== undefined && packet.inputs.length > 0) {
    lines.push(`Inputs: ${sorted(packet.inputs).join(', ')}`);
  }
  if (packet.outputs !== undefined && packet.outputs.length > 0) {
    lines.push(`Outputs: ${sorted(packet.outputs).join(', ')}`);
  }
  if (packet.dependencies !== undefined && packet.dependencies.length > 0) {
    lines.push(`Dependencies: ${sorted(packet.dependencies).join(', ')}`);
  }
  lines.push(`Status: ${packet.status}`);

  lines.push('', '# Context bundle', `Context id: ${context.contextId}`);
  if (context.l0Capsule.length > 0) lines.push(`Capsule: ${context.l0Capsule}`);
  if (context.l1Index.length > 0) lines.push(`Index: ${context.l1Index}`);
  if (context.l2Evidence.length > 0) lines.push(`Evidence: ${context.l2Evidence}`);
  if (context.retrievalHandles.length > 0) {
    lines.push(`Retrieval handles: ${sorted(context.retrievalHandles).join(', ')}`);
  }

  return lines.join('\n');
}

/** Injected PacketRenderer implementation (pure + deterministic). */
export const packetRenderer: PacketRenderer = {
  render(packet: PacketView, context: ContextView): string {
    return renderExecutionPacket(packet, context);
  },
};
