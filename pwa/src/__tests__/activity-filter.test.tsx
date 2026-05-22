import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { ExplorerActivities } from "../views/explorer/Activities";
import { parseHash } from "../route";

// AC-06 — Activities AND-filter URL works; URL is shareable + survives
// reload. Verifies filter chips reflect URL state and clearing a chip
// emits a URL without that slot.

describe("ExplorerActivities — multi-filter chips (FR-09 / AC-06)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ rows: [] }), { status: 200 }),
    );
  });

  test("no params → no chips rendered, lede note shown", async () => {
    const route = parseHash("#/explorer/activities");
    render(<ExplorerActivities route={route} />);
    expect(screen.queryByTestId("filter-chip-strip")).not.toBeInTheDocument();
    expect(screen.getByText(/no filters set/i)).toBeInTheDocument();
  });

  test("one param → one chip + URL-clear link", async () => {
    const route = parseHash("#/explorer/activities?system=sys-1");
    render(<ExplorerActivities route={route} />);
    const chip = await screen.findByTestId("filter-chip-system");
    expect(chip).toBeInTheDocument();
    // Clearing the only filter should land on the no-filters URL.
    expect(chip).toHaveAttribute("href", "#/explorer/activities");
  });

  test("two params → two chips; clearing one preserves the other in the URL", async () => {
    const route = parseHash("#/explorer/activities?system=sys-1&role=role-2");
    render(<ExplorerActivities route={route} />);
    const systemChip = await screen.findByTestId("filter-chip-system");
    const roleChip = await screen.findByTestId("filter-chip-role");
    expect(systemChip).toHaveAttribute("href", "#/explorer/activities?role=role-2");
    expect(roleChip).toHaveAttribute("href", "#/explorer/activities?system=sys-1");
  });

  test("three params → three chips, each clear preserves the other two", async () => {
    const route = parseHash("#/explorer/activities?system=sys-1&role=role-2&location=loc-3");
    render(<ExplorerActivities route={route} />);
    const sysChip = await screen.findByTestId("filter-chip-system");
    const roleChip = await screen.findByTestId("filter-chip-role");
    const locChip = await screen.findByTestId("filter-chip-location");
    expect(sysChip.getAttribute("href")).toMatch(/role=role-2/);
    expect(sysChip.getAttribute("href")).toMatch(/location=loc-3/);
    expect(sysChip.getAttribute("href")).not.toMatch(/system=/);
    expect(roleChip.getAttribute("href")).toMatch(/system=sys-1/);
    expect(locChip.getAttribute("href")).toMatch(/system=sys-1/);
  });

  test("fetch is called with the activityFilterAnd cypher + correct params", async () => {
    const route = parseHash("#/explorer/activities?system=sys-1&role=role-2");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rows: [] }), { status: 200 }),
    );
    render(<ExplorerActivities route={route} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0];
    expect(String(call?.[0])).toContain("/api/v1/query/cypher");
    const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body));
    expect(body.statement).toContain("MATCH (a:Activity)");
    expect(body.params).toEqual({ systemId: "sys-1", roleId: "role-2", locId: null });
  });

  test("renders activity-row links to entity-detail route", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          rows: [
            { id: "act-1", name: "Receive" },
            { id: "act-2", name: "Pick" },
          ],
        }),
        { status: 200 },
      ),
    );
    const route = parseHash("#/explorer/activities");
    render(<ExplorerActivities route={route} />);
    const rows = await screen.findAllByTestId("activity-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("href", "#/explorer/activities/act-1");
    expect(rows[1]).toHaveAttribute("href", "#/explorer/activities/act-2");
  });

  test("result_truncated banner renders when result has 1001 rows", async () => {
    const truncated = Array.from({ length: 1001 }, (_, i) => ({
      id: `act-${i}`,
      name: `Activity ${i}`,
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rows: truncated }), { status: 200 }),
    );
    const route = parseHash("#/explorer/activities");
    render(<ExplorerActivities route={route} />);
    expect(await screen.findByTestId("result-truncated")).toBeInTheDocument();
  });
});
