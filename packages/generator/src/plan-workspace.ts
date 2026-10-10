import type { GeneratedArtifact, Renderer } from './contracts.js';
import type { PlanningIR } from './ir.js';
import { artifactSources } from './render.js';
import {
  renderArchitecture,
  renderDomainModel,
  renderSecurityPrivacy,
  renderStateMachines,
} from './workspace/architecture.js';
import { renderPolicyRegister } from './workspace/compliance.js';
import { renderDecisions, renderOpenQuestions } from './workspace/decisions.js';
import { renderDesignBrief, renderDesignSystem } from './workspace/design.js';
import { renderMasterPlan } from './workspace/master-plan.js';
import { renderPromptsReadme, renderPhasePrompt } from './workspace/prompts.js';
import { renderReadme } from './workspace/readme.js';
import { renderProductRequirements } from './workspace/requirements.js';
import { renderRisks } from './workspace/risks.js';
import {
  renderTasksCsv,
  renderTestEvidence,
  renderTraceability,
} from './workspace/traceability.js';
import { renderTestStrategy } from './workspace/testing.js';

/**
 * Full planning-workspace renderer (P05-02 extension) — the registry.
 *
 * The Phase 05 renderers produced the plan spine only (roadmap, tracker, phase
 * docs, handoff template, standards, context, policies). A workspace with just
 * those leaves an agent nowhere to record architecture, requirements, design
 * decisions, risks, test strategy or the task list, so this renderer emits the
 * rest of the canonical planning workspace.
 *
 * The documents themselves live in `./workspace/<topic>.ts`, one module per
 * folder they emit; this file owns only the emission order and each document's
 * ownership. Ownership follows ADR-0016 and is chosen per document, not per
 * folder:
 *   - `generated` — derived entirely from the IR; PlanMo owns every byte and
 *     refreshes it on regeneration (README, MASTER-PLAN, traceability, task
 *     list, architecture, compliance, design, requirements, testing).
 *   - `seeded`    — PlanMo writes a useful starting point once, then the user
 *     owns the file; regeneration never touches it (DECISIONS, OPEN-QUESTIONS,
 *     RISKS, prompts). These accumulate human decisions, so rewriting them
 *     would destroy the only copy.
 *
 * Every renderer is pure: no clock, no randomness, no filesystem, no absolute
 * paths. Identical IR always produces byte-identical artifacts.
 */

interface DocumentSpec {
  path: string;
  ownership: 'generated' | 'seeded';
  render: (ir: PlanningIR) => string;
}

/**
 * Document set in deterministic emission order. Ownership is per document:
 * anything derived purely from the IR is `generated`; anything that will
 * accumulate human decisions is `seeded`.
 */
const DOCUMENTS: readonly DocumentSpec[] = [
  { path: 'planning/README.md', ownership: 'generated', render: renderReadme },
  { path: 'planning/MASTER-PLAN.md', ownership: 'generated', render: renderMasterPlan },
  { path: 'planning/DECISIONS.md', ownership: 'seeded', render: renderDecisions },
  { path: 'planning/OPEN-QUESTIONS.md', ownership: 'seeded', render: renderOpenQuestions },
  { path: 'planning/RISKS.md', ownership: 'seeded', render: renderRisks },
  {
    path: 'planning/REQUIREMENTS-TRACEABILITY.md',
    ownership: 'generated',
    render: renderTraceability,
  },
  { path: 'planning/tasks.csv', ownership: 'generated', render: renderTasksCsv },
  {
    path: 'planning/testing/TEST-EVIDENCE.csv',
    ownership: 'generated',
    render: renderTestEvidence,
  },
  {
    path: 'planning/architecture/ARCHITECTURE.md',
    ownership: 'generated',
    render: renderArchitecture,
  },
  {
    path: 'planning/architecture/DOMAIN-MODEL.md',
    ownership: 'generated',
    render: renderDomainModel,
  },
  {
    path: 'planning/architecture/SECURITY-PRIVACY.md',
    ownership: 'generated',
    render: renderSecurityPrivacy,
  },
  {
    path: 'planning/architecture/STATE-MACHINES.md',
    ownership: 'generated',
    render: renderStateMachines,
  },
  {
    path: 'planning/compliance/POLICY-REGISTER.md',
    ownership: 'generated',
    render: renderPolicyRegister,
  },
  { path: 'planning/design/DESIGN-BRIEF.md', ownership: 'generated', render: renderDesignBrief },
  { path: 'planning/design/DESIGN-SYSTEM.md', ownership: 'generated', render: renderDesignSystem },
  { path: 'planning/prompts/README.md', ownership: 'seeded', render: renderPromptsReadme },
  { path: 'planning/prompts/phase-prompt.md', ownership: 'seeded', render: renderPhasePrompt },
  {
    path: 'planning/requirements/PRODUCT-REQUIREMENTS.md',
    ownership: 'generated',
    render: renderProductRequirements,
  },
  { path: 'planning/testing/TEST-STRATEGY.md', ownership: 'generated', render: renderTestStrategy },
];

/** The paths this renderer emits, in emission order (used by tests/docs). */
export const PLAN_WORKSPACE_PATHS: readonly string[] = DOCUMENTS.map((d) => d.path);

/**
 * Render the full planning workspace for a compiled IR. Pure and
 * deterministic: identical IR always produces byte-identical artifacts.
 */
export const renderPlanWorkspace: Renderer = (ir) => {
  const sources = artifactSources(ir);
  return DOCUMENTS.map((spec): GeneratedArtifact => ({
    path: spec.path,
    content: spec.render(ir),
    kind: 'planning-doc',
    ownership: spec.ownership,
    sources,
  }));
};
