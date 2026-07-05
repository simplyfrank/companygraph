// model-workspace-core T-21 (AC-19) — each of the six sibling Model
// tabs renders ModelTabPlaceholder naming its owning downstream spec
// (blueprint View Tree, verbatim), with the shell-level active-model
// context available (the placeholder consumes useActiveModel() and
// must not error).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { renderView } from "../views";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { Route } from "../route";
import type { ModelRead } from "../api";

const REF_MODEL: ModelRead = {
  id: "0197a000-0000-7000-8000-0000000000a1",
  name: "Retail Reference",
  description: "Business Model #1",
  ordinal: 1,
  status: "active",
  isReference: true,
  moduleInstanceCount: 0,
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
};

// tab id → owning downstream spec, verbatim from the blueprint View Tree.
// Rows retire as their owning specs land and swap the dispatch target:
//  - "stories" retired 2026-07-04 — story-spec-core T-14 replaced the
//    placeholder with the live StoryCatalog (see story-catalog.test.tsx).
//  - "key-activities" retired 2026-07-05 — key-activity-optimizer T-14
//    replaced the placeholder with the live KeyActivityBoard (see
//    key-activity-board.test.tsx).
//  - "systems" retired 2026-07-05 — ddd-system-modeling T-13 replaced
//    the placeholder with the live SystemModeler (see
//    system-modeler.test.tsx).
const SIBLING_TABS: Array<[string, string]> = [
  ["canvas", "business-model-authoring"],
  ["kpi-impact", "kpi-impact-mapping"],
  ["export", "requirements-export"],
];

describe("Model sibling-tab placeholders (T-21, AC-19)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify([REF_MODEL]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
  });

  for (const [tab, spec] of SIBLING_TABS) {
    test(`#/model/${tab} renders the placeholder naming ${spec}, with active-model context available`, async () => {
      const route: Route = { surface: "model", tab, params: {} };
      render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);

      expect(screen.getByTestId("model-tab-placeholder")).toBeInTheDocument();
      expect(screen.getByTestId("model-placeholder-spec")).toHaveTextContent(spec);

      // Context proof: once the provider's list resolves, the
      // placeholder surfaces the active model without erroring.
      await waitFor(() => {
        expect(screen.getByTestId("model-placeholder-context")).toHaveTextContent(
          "Retail Reference",
        );
      });
    });
  }
});
