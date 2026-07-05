// model-workspace-core T-21 (AC-19) — originally asserted each of the six
// sibling Model tabs rendered ModelTabPlaceholder naming its owning
// downstream spec. As of 2026-07-05 ALL six downstream specs have shipped
// their live views, so every tab now dispatches a real view and the
// placeholder is retired for all of them. This test now guards the inverse
// (regression cover): the six Model tabs render a real view, NOT the
// placeholder — so an accidental revert to a placeholder is caught — while
// the shell-level active-model context still resolves without erroring.
//   - stories → StoryCatalog (story-spec-core T-14, 2026-07-04)
//   - key-activities → KeyActivityBoard (key-activity-optimizer T-14)
//   - systems → SystemModeler (ddd-system-modeling T-13)
//   - canvas → ModelCanvas (business-model-authoring)
//   - kpi-impact → KpiImpactMatrix (kpi-impact-mapping)
//   - export → SpecExport (requirements-export)

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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

// Every Model tab now dispatches a live view (all downstream specs shipped).
const LIVE_TABS = ["stories", "key-activities", "systems", "canvas", "kpi-impact", "export"];

describe("Model sibling-tab dispatch (T-21, AC-19 — post-build)", () => {
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

  for (const tab of LIVE_TABS) {
    test(`#/model/${tab} dispatches a real view, not the retired placeholder`, () => {
      const route: Route = { surface: "model", tab, params: {} };
      render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
      // The placeholder is retired for every tab — a real view renders in its
      // place. Its exact content (loading/empty/error/ready) is covered by
      // each view's own state tests; here we only guard against a regression
      // back to the placeholder, and that the active-model context resolves
      // without throwing.
      expect(screen.queryByTestId("model-tab-placeholder")).not.toBeInTheDocument();
    });
  }
});
