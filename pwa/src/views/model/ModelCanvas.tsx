// business-model-authoring T-14 (design §4.7, §6) — ModelCanvas view.
// Wizard shell with 5 steps. Reads the active model from useActiveModel()
// (same pattern as SystemModeler). Deep-linkable via #/model/canvas.
// Four states: loading, empty (no model), error, ready (wizard).

import { useEffect, useReducer, useState } from "react";
import type { Route } from "../../route";
import { useActiveModel } from "../../context/ActiveModelContext";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { authoring, stories as storiesApi, modules as modulesApi } from "../../api";
import type { AuthoringGraph } from "@companygraph/shared/schema/authoring";
import {
  wizardReducer,
  initialWizardState,
  resumeStep,
} from "./authoring/wizardModel";
import { TemplateStep } from "./authoring/TemplateStep";
import { DomainsStep } from "./authoring/DomainsStep";
import { JourneysStep } from "./authoring/JourneysStep";
import { ActivitiesRolesStep } from "./authoring/ActivitiesRolesStep";
import { StoriesStep } from "./authoring/StoriesStep";
import { toJourneyData } from "./authoring/toJourneyData";
import { JourneyCanvas } from "../../components/JourneyCanvas";

type CanvasState = "loading" | "empty" | "error" | "ready";

export function ModelCanvas({ route }: { route: Route }) {
  void route;
  const { activeModel, status: modelStatus } = useActiveModel();
  const modelId = activeModel?.id ?? null;

  const [state, setState] = useState<CanvasState>("loading");
  const [graph, setGraph] = useState<AuthoringGraph | null>(null);
  const [storyCount, setStoryCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [wizard, dispatch] = useReducer(wizardReducer, initialWizardState);
  const [domains, setDomains] = useState<Array<{ id: string; name: string; description: string }>>([]);

  const fetchAll = async (mid: string) => {
    setState("loading");
    try {
      const [g, storyList, domainList, moduleList] = await Promise.all([
        authoring.graph(mid),
        storiesApi.list(mid),
        // Domains come from the graph's journey domains, but we also
        // need them for the domain selector — fetch via query API.
        // The query endpoint wraps rows in a { rows: [...] } envelope
        // (graph-core NFR-05); unwrap it (tolerating a bare array too).
        fetch(`/api/v1/query/listDomains`)
          .then((r) => r.json())
          .then((body) =>
            (Array.isArray(body) ? body : body?.rows ?? []) as Array<{
              id: string;
              name: string;
              description: string;
            }>,
          ),
        modulesApi.list(),
      ]);
      setGraph(g);
      setStoryCount(storyList.length);
      setDomains(domainList.filter((d) => d.id !== undefined));

      // Resume step based on graph state
      const step = resumeStep(g, storyList.length);
      if (step !== "done") {
        // Don't auto-advance; just set the step
        dispatch({ type: "setDraft", draft: { resumedStep: step } });
      }

      // Check for reference model (has published modules)
      const hasRef = moduleList.length > 0;
      dispatch({ type: "setDraft", draft: { hasReferenceModel: hasRef } });

      setState("ready");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  };

  useEffect(() => {
    if (modelStatus === "ready" && modelId) {
      fetchAll(modelId);
    } else if (modelStatus === "error") {
      setErrorMsg("Failed to load active model");
      setState("error");
    } else if (modelStatus === "ready" && !modelId) {
      setState("empty");
    }
  }, [modelId, modelStatus]);

  const handleApply = async (body: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }) => {
    if (!modelId) throw new Error("No active model");
    return authoring.apply(modelId, body as Parameters<typeof authoring.apply>[1]);
  };

  const handleCreateDomain = async (name: string, description?: string) => {
    if (!modelId) throw new Error("No active model");
    const data: Record<string, string> = { name };
    if (description) data.description = description;
    const res = await fetch(`/api/v1/models/${encodeURIComponent(modelId)}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to create domain: ${res.status}`);
    const domain = await res.json() as { id: string; name: string; description: string };
    setDomains((prev) => [...prev, domain]);
    return domain;
  };

  const handlePatchDomain = async (domainId: string, body: { name?: string; description?: string }) => {
    if (!modelId) throw new Error("No active model");
    await authoring.patchDomain(modelId, domainId, body);
    setDomains((prev) =>
      prev.map((d) => (d.id === domainId ? { ...d, ...body } : d)),
    );
  };

  const handleBootstrap = async () => {
    if (!modelId) throw new Error("No active model");
    const result = await storiesApi.bootstrap(modelId);
    setStoryCount((prev) => prev + (result.created ?? 0));
    return { created: result.created ?? 0 };
  };

  const handleSearchRoles = async (q: string) => {
    const res = await fetch(`/api/v1/query/search?label=Role&q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return (data.rows ?? []) as Array<{ id: string; name: string }>;
  };

  if (state === "loading") return <Loading what="authoring graph" />;
  if (state === "empty") return <ViewHeader title="Model canvas" lede="Select or create a model first" />;
  if (state === "error")
    return <ErrorState message={errorMsg} onRetry={modelId ? () => fetchAll(modelId) : undefined} />;
  if (!graph) return <Loading what="authoring graph" />;

  return (
    <section aria-label="Model canvas" data-testid="model-canvas">
      <ViewHeader
        title="Model canvas"
        lede={`Authoring wizard for ${activeModel!.name}`}
      />

      {/* Wizard steps */}
      {wizard.step === "template" && (
        <TemplateStep
          state={wizard}
          dispatch={dispatch}
          hasReferenceModel={wizard.draft.hasReferenceModel === true}
        />
      )}
      {wizard.step === "domains" && (
        <DomainsStep
          state={wizard}
          dispatch={dispatch}
          domains={domains}
          modelId={modelId!}
          onCreateDomain={handleCreateDomain}
          onPatchDomain={handlePatchDomain}
        />
      )}
      {wizard.step === "journeys" && (
        <JourneysStep
          state={wizard}
          dispatch={dispatch}
          domains={domains}
          onApply={handleApply}
        />
      )}
      {wizard.step === "activities" && (
        <ActivitiesRolesStep
          state={wizard}
          dispatch={dispatch}
          graph={graph}
          onApply={handleApply}
          onSearchRoles={handleSearchRoles}
        />
      )}
      {wizard.step === "stories" && (
        <StoriesStep
          state={wizard}
          dispatch={dispatch}
          storyCount={storyCount}
          onBootstrap={handleBootstrap}
        />
      )}

      {/* Journey canvases — one per journey, chain layout */}
      {graph && graph.journeys.length > 0 && (
        <div data-testid="journey-canvases">
          {graph.journeys.map((j) => (
            <div key={j.id} data-testid={`journey-canvas-${j.id}`}>
              <h3>{j.name}</h3>
              <JourneyCanvas
                data={toJourneyData(graph, j.id)}
                layoutMode="chain"
                visibleLayers={{ roles: true, systems: true, locations: false }}
                selected={null}
                onSelect={() => {}}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
