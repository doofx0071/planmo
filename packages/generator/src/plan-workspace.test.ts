import { describe, expect, it } from 'vitest';
import { isTaskId, splitCsvLine, taskId, taskPhase } from '@planmo/shared';
import { buildIr } from './ir.js';
import { mediumAssuranceInput } from './fixtures.js';
import { PLAN_WORKSPACE_PATHS, renderPlanWorkspace } from './plan-workspace.js';
import { phaseTasks, renderPlanningDocuments } from './render.js';

/**
 * Full planning-workspace renderer. These tests pin the properties the
 * generator pipeline depends on: a complete, deterministic, IR-derived
 * document set with per-document ownership, and content that leaks neither
 * absolute paths nor the clock.
 */
const ir = buildIr(mediumAssuranceInput());

describe('renderPlanWorkspace', () => {
  it('emits the complete document set exactly once', () => {
    const artifacts = renderPlanWorkspace(ir);
    expect(artifacts).toHaveLength(PLAN_WORKSPACE_PATHS.length);
    const paths = artifacts.map((a) => a.path);
    expect(new Set(paths).size).toBe(paths.length); // no duplicates
    for (const path of PLAN_WORKSPACE_PATHS) expect(paths).toContain(path);
  });

  it('emits the folders the workspace promises', () => {
    const paths = renderPlanWorkspace(ir).map((a) => a.path);
    for (const folder of [
      'planning/architecture/',
      'planning/compliance/',
      'planning/design/',
      'planning/prompts/',
      'planning/requirements/',
      'planning/testing/',
    ]) {
      expect(
        paths.some((p) => p.startsWith(folder)),
        `missing ${folder}`,
      ).toBe(true);
    }
  });

  it('splits ownership: derived documents are generated, accumulators are seeded', () => {
    const artifacts = renderPlanWorkspace(ir);
    const seeded = artifacts.filter((a) => a.ownership === 'seeded').map((a) => a.path);
    expect(seeded.sort()).toEqual(
      [
        'planning/DECISIONS.md',
        'planning/OPEN-QUESTIONS.md',
        'planning/RISKS.md',
        'planning/prompts/README.md',
        'planning/prompts/phase-prompt.md',
      ].sort(),
    );
    for (const artifact of artifacts) {
      expect(['generated', 'seeded']).toContain(artifact.ownership);
    }
  });

  it('is deterministic — identical IR produces byte-identical artifacts', () => {
    const a = renderPlanWorkspace(ir);
    const b = renderPlanWorkspace(buildIr(mediumAssuranceInput()));
    expect(a).toEqual(b);
  });

  it('never emits an absolute path, a clock value or an empty document', () => {
    for (const artifact of renderPlanWorkspace(ir)) {
      expect(artifact.path.startsWith('/'), artifact.path).toBe(false);
      expect(/^[A-Za-z]:[\\/]/.test(artifact.path), artifact.path).toBe(false);
      // No Windows drive paths or POSIX roots inside content.
      expect(/[A-Za-z]:[\\/]/.test(artifact.content), `${artifact.path} has an absolute path`).toBe(
        false,
      );
      // No ISO timestamp: renderers must not read the clock.
      expect(/\d{4}-\d{2}-\d{2}T/.test(artifact.content), `${artifact.path} has a timestamp`).toBe(
        false,
      );
      expect(artifact.content.trim().length, `${artifact.path} is empty`).toBeGreaterThan(0);
      expect(artifact.content.endsWith('\n'), `${artifact.path} has no trailing newline`).toBe(
        true,
      );
    }
  });

  it('derives content from the IR', () => {
    const byPath = new Map(renderPlanWorkspace(ir).map((a) => [a.path, a.content]));
    const name = ir.project.project.name;
    expect(byPath.get('planning/MASTER-PLAN.md')).toContain(name);
    expect(byPath.get('planning/README.md')).toContain(name);
    // Every phase appears in the master plan and the traceability matrix.
    for (const phase of ir.phases) {
      expect(byPath.get('planning/MASTER-PLAN.md')).toContain(phase.objective);
      expect(byPath.get('planning/REQUIREMENTS-TRACEABILITY.md')).toContain(`| ${phase.id} |`);
    }
  });

  it('renders tasks.csv in the canonical five-column shape', () => {
    const csv = renderPlanWorkspace(ir).find((a) => a.path === 'planning/tasks.csv')?.content;
    expect(csv).toBeDefined();
    const lines = (csv ?? '').trimEnd().split('\n');
    // The shape is fixed by @planmo/trace's validator, which requires exactly
    // five fields per row (quote-aware, so a title may contain a comma).
    expect(lines[0]).toBe('id,phase,title,status,priority');
    expect(lines).toHaveLength(ir.phases.length * 4 + 1);
    for (const line of lines.slice(1)) {
      expect(splitCsvLine(line), line).toHaveLength(5);
      expect(line).toContain('TODO');
    }
  });

  it('seeds four canonical tasks per phase, numbered per phase', () => {
    const csv = renderPlanWorkspace(ir).find((a) => a.path === 'planning/tasks.csv')?.content;
    const rows = (csv ?? '')
      .trimEnd()
      .split('\n')
      .slice(1)
      .map((line) => splitCsvLine(line));

    expect(rows).toHaveLength(ir.phases.length * 4);
    for (const phase of ir.phases) {
      const ids = rows.filter((r) => r[1] === phase.id).map((r) => r[0]);
      expect(ids).toEqual([
        `P${phase.id}-01`,
        `P${phase.id}-02`,
        `P${phase.id}-03`,
        `P${phase.id}-04`,
      ]);
    }
    // Every row carries a canonical id whose embedded phase matches its column.
    for (const row of rows) {
      expect(isTaskId(row[0] ?? ''), row[0]).toBe(true);
      expect(taskPhase(row[0] ?? '')).toBe(row[1]);
      expect(['MUST', 'SHOULD', 'MAY']).toContain(row[4]);
    }
  });

  it('lists each phase its own tasks', () => {
    for (const phase of ir.phases) {
      const doc = renderPlanningDocuments(ir).find(
        (a) => a.path === `planning/phases/phase-${phase.id}.md`,
      )?.content;
      expect(doc, `phase ${phase.id}`).toContain('## Tasks');
      for (const [id] of phaseTasks(phase)) {
        expect(doc, `${id} in phase ${phase.id}`).toContain(`| ${id} |`);
      }
    }
  });

  it('the tracker names each phase task range', () => {
    const tracker = renderPlanningDocuments(ir).find(
      (a) => a.path === 'planning/TRACKER.md',
    )?.content;
    for (const phase of ir.phases) {
      expect(tracker, `phase ${phase.id}`).toContain(`P${phase.id}-01–P${phase.id}-04 (4)`);
    }
  });

  it('traceability links each requirement to its phase tasks', () => {
    const doc = renderPlanWorkspace(ir).find(
      (a) => a.path === 'planning/REQUIREMENTS-TRACEABILITY.md',
    )?.content;
    for (const phase of ir.phases) {
      expect(doc, `phase ${phase.id}`).toContain(
        `| ${phase.id} | ${taskId(phase.id, 1)}–${taskId(phase.id, 4)} |`,
      );
    }
  });

  it('records lineage on every artifact', () => {
    for (const artifact of renderPlanWorkspace(ir)) {
      expect(artifact.sources).toContain(`inputHash:${ir.inputHash}`);
      expect(artifact.kind).toBe('planning-doc');
    }
  });
});
