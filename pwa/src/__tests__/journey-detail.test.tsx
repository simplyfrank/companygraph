import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { ExplorerJourney } from "../views/explorer/Journey";
import type { Route } from "../route";

// AC-16 — Verification metadata visible on the journey-detail header.
// Fixture: journey with attributes._verification = {by:<role-id>,
// at:"2026-05-20"} → header text reads
// "Verified by 'Store Ops Lead' on 2026-05-20".

function makeRoute(entityId: string): Route {
  return { surface: "explorer", tab: "journey-detail", entityId, params: {} };
}

function mockJourneyFixture(opts: {
  journeyId: string;
  verification?: { by: string; at: string } | null;
  roleName?: string;
}): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const u = String(url);
    if (u.includes("/query/getJourney/")) {
      return new Response(
        JSON.stringify({
          rows: [
            {
              id: opts.journeyId,
              name: "Customer checkout",
              description: "End-to-end checkout journey",
              activities: [{ id: "a-1", name: "Scan" }, { id: "a-2", name: "Pay" }],
              // The real /api/v1/query/getJourney endpoint already returns
              // `verification` at the row level (pulled from
              // attributes_json._verification via APOC in query.ts), so the
              // PWA does NOT fan out an extra cypher call for it. The
              // fixture mirrors that contract.
              verification: opts.verification ?? null,
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (u.includes("/query/cypher") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { statement: string; params: Record<string, unknown> };
      // verifyingRoleName lookup
      if (body.statement.includes("RETURN r.name AS name")) {
        return new Response(
          JSON.stringify({
            rows: opts.roleName ? [{ name: opts.roleName }] : [],
          }),
          { status: 200 },
        );
      }
      // per-activity role assignment + PRECEDES order + other cyphers
      // — return empty rows
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    }
    if (u.includes("/query/neighbors/")) {
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

describe("ExplorerJourney verification header (FR-20 / AC-16)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("header renders 'Verified by <role-name> on <date>' when attributes carry _verification", async () => {
    mockJourneyFixture({
      journeyId: "j-1",
      verification: { by: "role-store-ops-lead", at: "2026-05-20" },
      roleName: "Store Ops Lead",
    });

    render(<ExplorerJourney route={makeRoute("j-1")} />);

    const line = await screen.findByTestId("verification-line");
    // Wait for the role-name cypher to resolve before asserting.
    await waitFor(() => expect(line.textContent).toContain("Store Ops Lead"));
    expect(line.textContent).toContain("2026-05-20");
    expect(line.textContent?.toLowerCase()).toContain("verified by");
  });

  test("header omits verification line when journey has no _verification attribute", async () => {
    mockJourneyFixture({
      journeyId: "j-2",
      verification: null,
    });

    render(<ExplorerJourney route={makeRoute("j-2")} />);
    await screen.findByText("Customer checkout");
    expect(screen.queryByTestId("verification-line")).not.toBeInTheDocument();
  });

  test("falls back to role id when verifyingRoleName lookup returns no rows", async () => {
    mockJourneyFixture({
      journeyId: "j-3",
      verification: { by: "role-orphan", at: "2026-04-01" },
      // Empty rows → no role name resolved.
    });

    render(<ExplorerJourney route={makeRoute("j-3")} />);
    const line = await screen.findByTestId("verification-line");
    // Without a resolved name, we render the id verbatim. That's the
    // graceful degradation contract — the SME still sees who/when.
    await waitFor(() => expect(line.textContent).toContain("role-orphan"));
    expect(line.textContent).toContain("2026-04-01");
  });

  test("route.entityId triggers detail mode (no domain picker)", async () => {
    mockJourneyFixture({ journeyId: "j-4", verification: null });
    render(<ExplorerJourney route={makeRoute("j-4")} />);
    expect(await screen.findByText("Customer checkout")).toBeInTheDocument();
    // The picker would render a "Domain" label — assert it does not.
    expect(screen.queryByText("Domain")).not.toBeInTheDocument();
  });
});

describe("ExplorerJourney PRECEDES cycle warning (FR-03 / AC-02)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function mockJourneyWithPrecedes(
    journeyId: string,
    activities: Array<{ id: string; name: string }>,
    precedesRows: Array<{ aId: string; createdAt: string; nextIds: string[] }>,
  ): void {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/query/getJourney/")) {
        return new Response(
          JSON.stringify({
            rows: [
              {
                id: journeyId,
                name: "Cycle test",
                description: "",
                activities,
                verification: null,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (u.includes("/query/cypher") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { statement: string };
        if (body.statement.includes("nextIds")) {
          return new Response(JSON.stringify({ rows: precedesRows }), { status: 200 });
        }
        return new Response(JSON.stringify({ rows: [] }), { status: 200 });
      }
      if (u.includes("/query/neighbors/")) {
        return new Response(JSON.stringify({ rows: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
  }

  test("linear PRECEDES chain renders WITHOUT the cycle ribbon", async () => {
    mockJourneyWithPrecedes(
      "j-linear",
      [
        { id: "a", name: "Scan" },
        { id: "b", name: "Pay" },
      ],
      [
        { aId: "a", createdAt: "2026-01-01T00:00:00Z", nextIds: ["b"] },
        { aId: "b", createdAt: "2026-01-02T00:00:00Z", nextIds: [] },
      ],
    );
    render(<ExplorerJourney route={makeRoute("j-linear")} />);
    await screen.findByText("Cycle test");
    await waitFor(() => {
      expect(screen.queryByTestId("cycle-warning")).not.toBeInTheDocument();
    });
  });

  test("cycle in PRECEDES surfaces the yellow warning ribbon", async () => {
    mockJourneyWithPrecedes(
      "j-cycle",
      [
        { id: "a", name: "Scan" },
        { id: "b", name: "Pay" },
        { id: "c", name: "Receipt" },
      ],
      [
        { aId: "a", createdAt: "2026-01-01T00:00:00Z", nextIds: ["b"] },
        { aId: "b", createdAt: "2026-01-02T00:00:00Z", nextIds: ["c"] },
        { aId: "c", createdAt: "2026-01-03T00:00:00Z", nextIds: ["a"] }, // closes the cycle
      ],
    );
    render(<ExplorerJourney route={makeRoute("j-cycle")} />);
    await screen.findByText("Cycle test");
    const ribbon = await screen.findByTestId("cycle-warning");
    expect(ribbon.textContent?.toLowerCase()).toContain("cycle");
  });
});
