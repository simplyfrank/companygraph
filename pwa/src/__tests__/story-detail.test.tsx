// story-spec-core T-14 / AC-11 — detail panel: narrative +
// activity/role + ACs as Given/When/Then triples; story edit PATCHes
// and the PATCH response's derived:false re-renders the badge away; AC
// add/edit/delete call the FR-06 routes; the detached indicator shows
// on the list row AND in the detail panel (mocked payload — producible
// by the real DD-11 contract per the story-crud integration seam).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import { parseHash } from "../route";
import { renderView } from "../views/index";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import type { ModelRead, StoryRead, AcRead } from "../api";

const MODEL: ModelRead = {
  id: "0197a000-0000-7000-8000-0000000000a1",
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

const AC1: AcRead = {
  id: "0197a000-0000-7000-8000-0000000000f1",
  name: "the cashier scans → totals update",
  description: "",
  given: "a cart with items",
  when: "the cashier scans",
  then: "totals update",
  ordinal: 1,
  derived: true,
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
};

const AC2: AcRead = {
  ...AC1,
  id: "0197a000-0000-7000-8000-0000000000f2",
  given: "totals shown",
  when: "the cashier tenders",
  then: "a receipt prints",
  ordinal: 2,
  derived: false,
};

const STORY: StoryRead = {
  id: "0197a000-0000-7000-8000-0000000000s1",
  name: "As a Cashier, I want to scan items, so that the checkout workflow completes.",
  description: "",
  persona: "Cashier",
  action: "scan items",
  benefit: "the checkout workflow completes",
  narrative: "As a Cashier, I want to scan items, so that the checkout workflow completes.",
  derived: true,
  sourceActivityId: "0197a000-0000-7000-8000-0000000000c1",
  activityId: "0197a000-0000-7000-8000-0000000000c1",
  activityName: "Scan items",
  roleId: "0197a000-0000-7000-8000-0000000000r1",
  roleName: "Cashier",
  acCount: 2,
  detached: false,
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const STORIES_URL = `/api/v1/models/${MODEL.id}/stories`;
const STORY_URL = `${STORIES_URL}/${STORY.id}`;
const ACS_URL = `${STORY_URL}/acceptance-criteria`;

interface Recorded {
  method: string;
  url: string;
  body: unknown;
}

function mockApi(opts?: { detached?: boolean }) {
  const calls: Recorded[] = [];
  let detail: StoryRead = {
    ...STORY,
    ...(opts?.detached ? { detached: true, activityId: null, activityName: null } : {}),
    acceptanceCriteria: [AC1, AC2],
  };
  const listRow = (): StoryRead => {
    const { acceptanceCriteria: _acs, ...row } = detail;
    return row as StoryRead;
  };

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (url === "/api/v1/models" && method === "GET") return jsonRes([MODEL]);
    if (url === STORIES_URL && method === "GET") return jsonRes([listRow()]);
    if (url === STORY_URL && method === "GET") return jsonRes(detail);
    if (url === STORY_URL && method === "PATCH") {
      detail = { ...detail, ...(body as Partial<StoryRead>), derived: false };
      const { acceptanceCriteria: _acs, ...res } = detail;
      return jsonRes(res);
    }
    if (url === ACS_URL && method === "POST") {
      const created: AcRead = { ...AC1, ...(body as Partial<AcRead>), id: "new-ac", ordinal: 3, derived: false };
      detail = { ...detail, acceptanceCriteria: [...detail.acceptanceCriteria!, created] };
      return jsonRes(created, 201);
    }
    const acMatch = url.match(new RegExp(`^${ACS_URL}/([^/]+)$`));
    if (acMatch && method === "PATCH") {
      detail = {
        ...detail,
        acceptanceCriteria: detail.acceptanceCriteria!.map((ac) =>
          ac.id === acMatch[1] ? { ...ac, ...(body as Partial<AcRead>), derived: false } : ac,
        ),
      };
      return jsonRes(detail.acceptanceCriteria!.find((ac) => ac.id === acMatch[1]));
    }
    if (acMatch && method === "DELETE") {
      detail = {
        ...detail,
        acceptanceCriteria: detail.acceptanceCriteria!.filter((ac) => ac.id !== acMatch[1]),
      };
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  return { calls };
}

async function mountAndOpenDetail() {
  const route = parseHash("#/model/stories");
  render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
  await waitFor(() => expect(screen.getByTestId(`story-row-${STORY.id}`)).toBeInTheDocument());
  fireEvent.click(screen.getByTestId(`story-row-${STORY.id}`));
  await waitFor(() => expect(screen.getByTestId("story-detail")).toBeInTheDocument());
}

describe("StoryCatalog detail + edit (T-14, AC-11)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/stories";
  });

  test("detail shows narrative, activity/role and ACs as Given/When/Then triples", async () => {
    mockApi();
    await mountAndOpenDetail();
    const detail = screen.getByTestId("story-detail");
    expect(detail).toHaveTextContent(STORY.narrative!);
    expect(detail).toHaveTextContent("Scan items");
    expect(detail).toHaveTextContent("Cashier");
    const row1 = within(detail).getByTestId(`ac-row-${AC1.id}`);
    expect(row1).toHaveTextContent("Given");
    expect(row1).toHaveTextContent("a cart with items");
    expect(row1).toHaveTextContent("When");
    expect(row1).toHaveTextContent("the cashier scans");
    expect(row1).toHaveTextContent("Then");
    expect(row1).toHaveTextContent("totals update");
  });

  test("story edit PATCHes and the derived badge re-renders away (DD-05)", async () => {
    const { calls } = mockApi();
    await mountAndOpenDetail();
    const detail = screen.getByTestId("story-detail");
    expect(within(detail).getAllByTestId("derived-badge").length).toBeGreaterThan(0);

    fireEvent.click(within(detail).getByRole("button", { name: "Edit story" }));
    const benefit = within(detail).getByLabelText(/benefit/i);
    fireEvent.change(benefit, { target: { value: "customers leave happy" } });
    fireEvent.click(within(detail).getByRole("button", { name: "Save story" }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === "PATCH" && c.url === STORY_URL);
      expect(patch).toBeDefined();
      expect((patch!.body as Record<string, unknown>).benefit).toBe("customers leave happy");
    });
    // The story-level derived badge is gone (AC1's own badge may remain).
    await waitFor(() => {
      const detailNow = screen.getByTestId("story-detail");
      const narrativeP = detailNow.querySelector("p")!;
      expect(within(narrativeP as HTMLElement).queryByTestId("derived-badge")).toBeNull();
    });
  });

  test("AC add / edit / delete call the FR-06 routes", async () => {
    const { calls } = mockApi();
    await mountAndOpenDetail();
    const detail = screen.getByTestId("story-detail");

    // Add.
    const addForm = within(detail).getByTestId("add-ac-form");
    fireEvent.change(within(addForm as HTMLElement).getByLabelText(/given/i), {
      target: { value: "g3" },
    });
    fireEvent.change(within(addForm as HTMLElement).getByLabelText(/when/i), {
      target: { value: "w3" },
    });
    fireEvent.change(within(addForm as HTMLElement).getByLabelText(/then/i), {
      target: { value: "t3" },
    });
    fireEvent.submit(addForm);
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url === ACS_URL)).toBe(true),
    );

    // Edit AC2.
    await waitFor(() => expect(screen.getByTestId(`ac-row-${AC2.id}`)).toBeInTheDocument());
    const row2 = screen.getByTestId(`ac-row-${AC2.id}`);
    fireEvent.click(within(row2).getByRole("button", { name: "Edit" }));
    fireEvent.change(within(row2).getByLabelText(/then/i), {
      target: { value: "a gift receipt prints" },
    });
    fireEvent.click(within(row2).getByRole("button", { name: "Save AC" }));
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "PATCH" && c.url === `${ACS_URL}/${AC2.id}`),
      ).toBe(true),
    );

    // Delete AC1.
    const row1 = screen.getByTestId(`ac-row-${AC1.id}`);
    fireEvent.click(within(row1).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "DELETE" && c.url === `${ACS_URL}/${AC1.id}`),
      ).toBe(true),
    );
  });

  test("reorder = up/down buttons → PATCH {ordinal} (no drag handler)", async () => {
    const { calls } = mockApi();
    await mountAndOpenDetail();
    const row2 = screen.getByTestId(`ac-row-${AC2.id}`);
    fireEvent.click(within(row2).getByRole("button", { name: "Move up" }));
    await waitFor(() => {
      const patches = calls.filter(
        (c) => c.method === "PATCH" && c.url.startsWith(`${ACS_URL}/`),
      );
      expect(patches.length).toBe(2); // swap: self + neighbor
      expect(patches.map((p) => (p.body as { ordinal: number }).ordinal).sort()).toEqual([1, 2]);
    });
  });

  test("detached indicator shows on the list row and in the detail panel (DD-11)", async () => {
    mockApi({ detached: true });
    const route = parseHash("#/model/stories");
    render(<ActiveModelProvider>{renderView(route)}</ActiveModelProvider>);
    await waitFor(() => expect(screen.getByTestId(`story-row-${STORY.id}`)).toBeInTheDocument());
    expect(screen.getByTestId("detached-badge")).toBeInTheDocument(); // list row

    fireEvent.click(screen.getByTestId(`story-row-${STORY.id}`));
    await waitFor(() => expect(screen.getByTestId("story-detail")).toBeInTheDocument());
    const detail = screen.getByTestId("story-detail");
    expect(within(detail).getByTestId("detached-badge")).toBeInTheDocument(); // panel
    expect(detail).toHaveTextContent("(deleted — re-point or delete)");
  });
});
