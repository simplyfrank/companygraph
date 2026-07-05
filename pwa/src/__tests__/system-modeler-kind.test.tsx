// ddd-system-modeling T-15 / AC-20 (component half) — SystemModeler
// renders a supporting system's kind badge via SYSTEM_KINDS /
// SYSTEM_KIND_LABELS (shared/src/schema/system-kind.ts — the imported
// vocabulary, never a re-declared literal), reading the read-model's
// `systemKind` field (which the SERVER parses off
// System.attributes.systemKind — design §4.2/§4.11). A legacy
// `attributes.kind` value planted in the stub is NEVER rendered as a
// kind. Pairs with the T-13 CLI grep (AC-20 has a component + CLI
// half).
//
// NOTE (T-15 conditional, design §8): T-13 rendered kinds directly via
// SYSTEM_KIND_LABELS — the preferred path — so
// pwa/src/lib/journeyData.ts stays UNTOUCHED (its sAttrs.kind read
// belongs to its surface owner; FR-15 is `should`, scoped to what this
// spec exercises).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import { SYSTEM_KIND_LABELS, SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, CapabilityRead, GapsResult, ContextMapResult } from "../api";

const MODEL: ModelRead = {
  id: "0197b100-0000-7000-8000-0000000000a1",
  name: "Retail Reference",
  description: "",
  ordinal: 1,
  status: "active",
  isReference: true,
  moduleInstanceCount: 0,
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
};

const AGENTIC_KIND = SYSTEM_KINDS[1]; // "agentic" — from the vocabulary, no literal

const LEGACY_SENTINEL = "legacy-kind-sentinel";

const CAP_LIST_ROW: CapabilityRead = {
  id: "0197b100-0000-7000-8000-0000000000c1",
  name: "Allocate stock",
  description: "",
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  // A legacy `kind` attribute rides the open attributes map — it must
  // NOT surface as a kind badge anywhere.
  attributes: { kind: LEGACY_SENTINEL },
  neededByCount: 1,
  supportingSystemCount: 1,
  assignedContextId: null,
  assignedContextName: null,
};

const CAP_DETAIL: CapabilityRead = {
  ...CAP_LIST_ROW,
  neededBy: [],
  supportedBy: [
    {
      id: "0197b100-0000-7000-8000-0000000000s1",
      name: "Allocation Engine",
      systemKind: AGENTIC_KIND,
    },
  ],
  assignedContext: null,
  detached: [],
};

const GAPS: GapsResult = {
  unsupportedSteps: [],
  capabilityGaps: [],
  capabilitiesWithoutSystem: [],
  orphanSystems: [],
  augmentationMix: {
    perCapability: [
      {
        capabilityId: CAP_LIST_ROW.id,
        name: CAP_LIST_ROW.name,
        counts: { functional: 0, agentic: 1, ai_predictive: 0, unknown: 0 },
        shares: { functional: 0, agentic: 1, ai_predictive: 0, unknown: 0 },
      },
    ],
    model: { functional: 0, agentic: 1, ai_predictive: 0, unknown: 0 },
  },
};

const CTX_EMPTY: ContextMapResult = { contexts: [], unassigned: [] };

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mockApi() {
  const base = `/api/v1/models/${MODEL.id}`;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/v1/models") return jsonRes([MODEL]);
    if (url === `${base}/capabilities`) return jsonRes([CAP_LIST_ROW]);
    if (url === `${base}/capabilities/${CAP_DETAIL.id}`) return jsonRes(CAP_DETAIL);
    if (url === `${base}/system-model/gaps`) return jsonRes(GAPS);
    if (url === `${base}/system-model/context-map`) return jsonRes(CTX_EMPTY);
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe("SystemModeler systemKind read path (T-15, AC-20 component half)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/systems";
  });

  test("a supporting system with systemKind renders its SYSTEM_KIND_LABELS text label — not color-only", async () => {
    mockApi();
    render(<ActiveModelProvider>{renderView(parseHash("#/model/systems"))}</ActiveModelProvider>);

    // List row badge (from the augmentation mix) carries the label text.
    await waitFor(() =>
      expect(screen.getByTestId(`cap-kinds-${CAP_LIST_ROW.id}`)).toBeInTheDocument(),
    );
    expect(screen.getByTestId(`cap-kinds-${CAP_LIST_ROW.id}`)).toHaveTextContent(
      SYSTEM_KIND_LABELS[AGENTIC_KIND],
    );

    // Detail badge too.
    fireEvent.click(screen.getByTestId(`cap-open-${CAP_DETAIL.id}`));
    await waitFor(() => expect(screen.getByTestId("cap-detail-panel")).toBeInTheDocument());
    const supported = screen.getByTestId("detail-supported-by");
    expect(within(supported).getByText(SYSTEM_KIND_LABELS[AGENTIC_KIND])).toBeInTheDocument();
  });

  test("a legacy attributes.kind value is NOT read as the kind", async () => {
    mockApi();
    render(<ActiveModelProvider>{renderView(parseHash("#/model/systems"))}</ActiveModelProvider>);
    await waitFor(() =>
      expect(screen.getByTestId(`cap-row-${CAP_LIST_ROW.id}`)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId(`cap-open-${CAP_DETAIL.id}`));
    await waitFor(() => expect(screen.getByTestId("cap-detail-panel")).toBeInTheDocument());
    // The sentinel planted in attributes.kind never renders anywhere.
    expect(screen.queryByText(new RegExp(LEGACY_SENTINEL))).not.toBeInTheDocument();
  });
});
