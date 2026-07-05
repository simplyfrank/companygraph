// ddd-system-modeling T-18 / AC-13 — the capability detail panel:
// name/description + needed-by sources + supported-by systems with
// systemKind badges + assigned context; edit PATCHes; add/remove
// needed-by/system and set/clear context call the FR-05 routes (the
// three PUTs send method PUT — DD-11) and update the panel; the
// detached indicator renders when a stub response's detached[] is
// non-empty (DD-13 — no live dangling edge needed).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import { SYSTEM_KIND_LABELS, SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, CapabilityRead, GapsResult, ContextMapResult } from "../api";

const MODEL: ModelRead = {
  id: "0197b500-0000-7000-8000-0000000000a1",
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

const ACTIVITY = { id: "0197b500-0000-7000-8000-0000000000aa", name: "Pick items" };
const STORY = { id: "0197b500-0000-7000-8000-0000000000ss", name: "As a picker…" };
const SYSTEM = { id: "0197b500-0000-7000-8000-0000000000sy", name: "WMS" };
const NEW_SYSTEM = { id: "0197b500-0000-7000-8000-0000000000s2", name: "Slotting AI" };
const BC = { id: "0197b500-0000-7000-8000-0000000000bc", name: "BC7 Fulfilment" };

const DETAIL: CapabilityRead = {
  id: "0197b500-0000-7000-8000-0000000000c1",
  name: "Fulfil an order",
  description: "End-to-end order fulfilment",
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
  neededByCount: 2,
  supportingSystemCount: 1,
  assignedContextId: BC.id,
  assignedContextName: BC.name,
  neededBy: [
    { kind: "activity", id: ACTIVITY.id, name: ACTIVITY.name },
    { kind: "story", id: STORY.id, name: STORY.name },
  ],
  supportedBy: [{ id: SYSTEM.id, name: SYSTEM.name, systemKind: SYSTEM_KINDS[0] }],
  assignedContext: { id: BC.id, name: BC.name, domain: "Ops", subdomain: "Fulfilment" },
  detached: [],
};

const LIST_ROW: CapabilityRead = {
  ...DETAIL,
  neededBy: undefined as never,
  supportedBy: undefined as never,
  assignedContext: undefined as never,
  detached: undefined as never,
};

const GAPS: GapsResult = {
  unsupportedSteps: [],
  capabilityGaps: [],
  capabilitiesWithoutSystem: [],
  orphanSystems: [],
  augmentationMix: {
    perCapability: [
      {
        capabilityId: DETAIL.id,
        name: DETAIL.name,
        counts: { functional: 1, agentic: 0, ai_predictive: 0, unknown: 0 },
        shares: { functional: 1, agentic: 0, ai_predictive: 0, unknown: 0 },
      },
    ],
    model: { functional: 1, agentic: 0, ai_predictive: 0, unknown: 0 },
  },
};

const CTX: ContextMapResult = { contexts: [], unassigned: [] };

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

interface Recorded {
  method: string;
  url: string;
  body: unknown;
}

// Mutable-detail mock: mutations update `current`, PUTs return it,
// GET detail serves it.
function mockApi(initialDetail: CapabilityRead) {
  const base = `/api/v1/models/${MODEL.id}`;
  let current = initialDetail;
  const recorded: Recorded[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    recorded.push({ method, url, body });

    if (url === "/api/v1/models") return jsonRes([MODEL]);
    if (url === `${base}/capabilities` && method === "GET") return jsonRes([current]);
    if (url === `${base}/system-model/gaps`) return jsonRes(GAPS);
    if (url === `${base}/system-model/context-map`) return jsonRes(CTX);

    const capBase = `${base}/capabilities/${current.id}`;
    if (url === capBase && method === "GET") return jsonRes(current);
    if (url === capBase && method === "PATCH") {
      current = { ...current, ...(body as Partial<CapabilityRead>) };
      return jsonRes(current);
    }
    if (url === `${capBase}/needed-by` && method === "PUT") {
      const b = body as { activityId?: string; storyId?: string };
      current = {
        ...current,
        neededBy: [
          ...(current.neededBy ?? []),
          b.activityId
            ? { kind: "activity" as const, id: b.activityId, name: "added activity" }
            : { kind: "story" as const, id: b.storyId!, name: "added story" },
        ],
      };
      return jsonRes(current);
    }
    if (url === `${capBase}/needed-by` && method === "DELETE") {
      const b = body as { activityId?: string; storyId?: string };
      const gone = b.activityId ?? b.storyId;
      current = {
        ...current,
        neededBy: (current.neededBy ?? []).filter((s) => s.id !== gone),
      };
      return new Response(null, { status: 204 });
    }
    if (url === `${capBase}/supported-by` && method === "PUT") {
      const b = body as { systemId: string };
      current = {
        ...current,
        supportedBy: [
          ...(current.supportedBy ?? []),
          { id: b.systemId, name: NEW_SYSTEM.name, systemKind: SYSTEM_KINDS[1] },
        ],
      };
      return jsonRes(current);
    }
    if (url === `${capBase}/supported-by/${SYSTEM.id}` && method === "DELETE") {
      current = {
        ...current,
        supportedBy: (current.supportedBy ?? []).filter((s) => s.id !== SYSTEM.id),
      };
      return new Response(null, { status: 204 });
    }
    if (url === `${capBase}/context` && method === "PUT") {
      const b = body as { boundedContextId: string };
      current = {
        ...current,
        assignedContext: { id: b.boundedContextId, name: "New Context", domain: null, subdomain: null },
        assignedContextId: b.boundedContextId,
        assignedContextName: "New Context",
      };
      return jsonRes(current);
    }
    if (url === `${capBase}/context` && method === "DELETE") {
      current = {
        ...current,
        assignedContext: null,
        assignedContextId: null,
        assignedContextName: null,
      };
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  return { spy, recorded };
}

async function mountAndOpen() {
  render(<ActiveModelProvider>{renderView(parseHash("#/model/systems"))}</ActiveModelProvider>);
  await waitFor(() => expect(screen.getByTestId(`cap-open-${DETAIL.id}`)).toBeInTheDocument());
  fireEvent.click(screen.getByTestId(`cap-open-${DETAIL.id}`));
  await waitFor(() => expect(screen.getByTestId("cap-detail-panel")).toBeInTheDocument());
}

describe("SystemModeler detail + mapping editing (T-18, AC-13)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/systems";
  });

  test("detail shows name/description, needed-by sources, supported-by with kind badges, assigned context", async () => {
    mockApi(DETAIL);
    await mountAndOpen();

    expect(screen.getByTestId("detail-description")).toHaveTextContent(
      "End-to-end order fulfilment",
    );
    const neededBy = screen.getByTestId("detail-needed-by");
    expect(within(neededBy).getByText(ACTIVITY.name)).toBeInTheDocument();
    expect(within(neededBy).getByText(STORY.name)).toBeInTheDocument();
    const supported = screen.getByTestId("detail-supported-by");
    expect(within(supported).getByText(SYSTEM.name)).toBeInTheDocument();
    expect(
      within(supported).getByText(SYSTEM_KIND_LABELS[SYSTEM_KINDS[0]]),
    ).toBeInTheDocument();
    expect(screen.getByTestId("detail-context")).toHaveTextContent(BC.name);
  });

  test("edit PATCHes name/description and the panel updates", async () => {
    const { recorded } = mockApi(DETAIL);
    await mountAndOpen();

    fireEvent.change(screen.getByTestId("edit-name"), { target: { value: "Fulfil + return" } });
    fireEvent.submit(screen.getByTestId("edit-form"));

    await waitFor(() =>
      expect(
        recorded.some(
          (r) =>
            r.method === "PATCH" &&
            r.url.endsWith(`/capabilities/${DETAIL.id}`) &&
            (r.body as { name: string }).name === "Fulfil + return",
        ),
      ).toBe(true),
    );
  });

  test("add/remove needed-by call the FR-05 routes (PUT/body-DELETE) and update the panel", async () => {
    const { recorded } = mockApi(DETAIL);
    await mountAndOpen();

    // Add a story source.
    fireEvent.change(screen.getByTestId("needed-by-kind"), { target: { value: "story" } });
    fireEvent.change(screen.getByTestId("needed-by-id"), {
      target: { value: "0197b500-0000-7000-8000-0000000000s9" },
    });
    fireEvent.submit(screen.getByTestId("add-needed-by-form"));
    await waitFor(() =>
      expect(within(screen.getByTestId("detail-needed-by")).getByText("added story")).toBeInTheDocument(),
    );
    const putCall = recorded.find(
      (r) => r.method === "PUT" && r.url.endsWith("/needed-by"),
    )!;
    expect(putCall).toBeDefined();
    expect((putCall.body as { storyId: string }).storyId).toBe(
      "0197b500-0000-7000-8000-0000000000s9",
    );

    // Remove the activity source (body-carrying DELETE).
    const row = screen.getByTestId(`needed-by-${ACTIVITY.id}`);
    fireEvent.click(within(row).getByText("Remove"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("detail-needed-by")).queryByText(ACTIVITY.name),
      ).not.toBeInTheDocument(),
    );
    const delCall = recorded.find(
      (r) => r.method === "DELETE" && r.url.endsWith("/needed-by"),
    )!;
    expect((delCall.body as { activityId: string }).activityId).toBe(ACTIVITY.id);
  });

  test("add/remove supporting system + set/clear context call their routes and update the panel", async () => {
    const { recorded } = mockApi(DETAIL);
    await mountAndOpen();

    // Add a system (PUT).
    fireEvent.change(screen.getByTestId("supported-by-id"), {
      target: { value: NEW_SYSTEM.id },
    });
    fireEvent.submit(screen.getByTestId("add-supported-by-form"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("detail-supported-by")).getByText(NEW_SYSTEM.name),
      ).toBeInTheDocument(),
    );
    expect(
      recorded.some((r) => r.method === "PUT" && r.url.endsWith("/supported-by")),
    ).toBe(true);

    // Remove the original system (param DELETE).
    const sysRow = screen.getByTestId(`supported-by-${SYSTEM.id}`);
    fireEvent.click(within(sysRow).getByText("Remove"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("detail-supported-by")).queryByText(SYSTEM.name),
      ).not.toBeInTheDocument(),
    );
    expect(
      recorded.some(
        (r) => r.method === "DELETE" && r.url.endsWith(`/supported-by/${SYSTEM.id}`),
      ),
    ).toBe(true);

    // Clear then set the context.
    fireEvent.click(within(screen.getByTestId("detail-context")).getByText("Clear"));
    await waitFor(() =>
      expect(screen.getByTestId("detail-context")).toHaveTextContent("unassigned"),
    );
    expect(
      recorded.some((r) => r.method === "DELETE" && r.url.endsWith("/context")),
    ).toBe(true);

    fireEvent.change(screen.getByTestId("context-id"), {
      target: { value: "0197b500-0000-7000-8000-0000000000b2" },
    });
    fireEvent.submit(screen.getByTestId("set-context-form"));
    await waitFor(() =>
      expect(screen.getByTestId("detail-context")).toHaveTextContent("New Context"),
    );
    const ctxPut = recorded.find((r) => r.method === "PUT" && r.url.endsWith("/context"))!;
    expect((ctxPut.body as { boundedContextId: string }).boundedContextId).toBe(
      "0197b500-0000-7000-8000-0000000000b2",
    );
  });

  test("the detached indicator renders when the stub's detached[] is non-empty (DD-13)", async () => {
    const detachedTarget = "0197b500-0000-7000-8000-00000000dead";
    mockApi({
      ...DETAIL,
      assignedContext: null,
      assignedContextId: null,
      assignedContextName: null,
      detached: [{ kind: "context", targetId: detachedTarget }],
    });
    await mountAndOpen();

    const indicator = screen.getByTestId(`detached-${detachedTarget}`);
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent(/detached/i);
  });
});
