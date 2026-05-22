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
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (u.includes("/query/cypher") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { statement: string; params: Record<string, unknown> };
      // journey attributes_json fetch
      if (body.statement.includes("RETURN j.attributes_json AS attrs")) {
        const attrs = opts.verification ? { _verification: opts.verification } : {};
        return new Response(
          JSON.stringify({ rows: [{ attrs: JSON.stringify(attrs) }] }),
          { status: 200 },
        );
      }
      // verifyingRoleName lookup
      if (body.statement.includes("RETURN r.name AS name")) {
        return new Response(
          JSON.stringify({
            rows: opts.roleName ? [{ name: opts.roleName }] : [],
          }),
          { status: 200 },
        );
      }
      // per-activity role assignment + other cyphers — return empty rows
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
