// business-model-authoring T-07 (design §3.4) — pure wizard step model,
// reducer, canAdvance, and resumeStep. No I/O, no network import.

import type { AuthoringGraph, AuthoringApplyResult } from "@companygraph/shared/schema/authoring";

export type WizardStep = "template" | "domains" | "journeys" | "activities" | "stories";

export const WIZARD_STEPS: WizardStep[] = ["template", "domains", "journeys", "activities", "stories"];

export type TemplateChoice = "blank" | "retail-clone" | null;

export interface WizardCommitted {
  domainIds: string[];
  nodeIds: Record<string, string>; // clientKey → uuid
  edgeIds: Record<string, string>; // "<type>:<from>-><to>" → uuid
}

export interface WizardState {
  step: WizardStep;
  template: TemplateChoice;
  committed: WizardCommitted;
  draft: Record<string, unknown>;
  error: string | null;
}

export type WizardAction =
  | { type: "next" }
  | { type: "back" }
  | { type: "setTemplate"; template: TemplateChoice }
  | { type: "commitDomain"; domainId: string }
  | { type: "commitApply"; result: AuthoringApplyResult }
  | { type: "setDraft"; draft: Record<string, unknown> }
  | { type: "setError"; error: string | null };

export const initialWizardState: WizardState = {
  step: "template",
  template: null,
  committed: { domainIds: [], nodeIds: {}, edgeIds: {} },
  draft: {},
  error: null,
};

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "next": {
      if (!canAdvance(state)) return state;
      const idx = WIZARD_STEPS.indexOf(state.step);
      if (idx >= WIZARD_STEPS.length - 1) return state;
      return { ...state, step: WIZARD_STEPS[idx + 1]!, error: null };
    }
    case "back": {
      const idx = WIZARD_STEPS.indexOf(state.step);
      if (idx <= 0) return state;
      return { ...state, step: WIZARD_STEPS[idx - 1]!, error: null };
    }
    case "setTemplate":
      return { ...state, template: action.template };
    case "commitDomain":
      return {
        ...state,
        committed: {
          ...state.committed,
          domainIds: [...state.committed.domainIds, action.domainId],
        },
      };
    case "commitApply": {
      return {
        ...state,
        committed: {
          ...state.committed,
          nodeIds: { ...state.committed.nodeIds, ...action.result.ids.nodes },
          edgeIds: { ...state.committed.edgeIds, ...action.result.ids.edges },
        },
      };
    }
    case "setDraft":
      return { ...state, draft: action.draft };
    case "setError":
      return { ...state, error: action.error };
    default:
      return state;
  }
}

export function canAdvance(state: WizardState): boolean {
  switch (state.step) {
    case "template":
      return state.template !== null;
    case "domains":
      return state.committed.domainIds.length >= 1;
    case "journeys":
      return Object.keys(state.committed.nodeIds).length >= 1;
    case "activities":
      return Object.keys(state.committed.nodeIds).length >= 2;
    case "stories":
      return true;
    default:
      return false;
  }
}

export function resumeStep(graph: AuthoringGraph, storyCount: number): WizardStep | "done" {
  if (graph.journeys.length === 0 && graph.roles.length === 0) {
    // No domains → template step (first unsatisfied)
    // Check if any journeys exist; if none, we need domains first
    return "domains";
  }
  if (graph.journeys.length === 0) return "journeys";
  const hasActivities = graph.journeys.some((j) => j.activities.length > 0);
  if (!hasActivities) return "activities";
  if (storyCount === 0) return "stories";
  return "done";
}
