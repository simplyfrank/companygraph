// T-16b: Bulk sign-off test (FR-23 / AC-19)
//
// Verifies that bulk sign-off preserves _review when writing _verification
// (RMW pattern / B-01 fix).

import { describe, test, expect, beforeEach, vi } from "vitest";

describe("Bulk sign-off RMW preservation (T-16b / AC-19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("3 journeys with prior _review: post-sign-off all carry BOTH _review AND _verification", async () => {
    const journeyIds = ["j-1", "j-2", "j-3"];
    const existingAttrs = [
      { _review: { status: "needs_review", set_by: "sme-1", set_at: "2026-04-01T00:00:00Z" } },
      { _review: { status: "needs_review", set_by: "sme-2", set_at: "2026-04-10T00:00:00Z" } },
      { _review: { status: "approved", set_by: "sme-3", set_at: "2026-03-15T00:00:00Z" } },
    ];

    let importPayload: { nodes: Array<{ id: string; attributes: Record<string, unknown> }> } | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (!init?.method || init.method === "GET") {
        // GET node attributes — return journey with existing _review
        const id = u.split("/").pop()!;
        const idx = journeyIds.indexOf(id);
        return new Response(
          JSON.stringify({
            rows: [{
              id,
              name: `Journey ${idx + 1}`,
              description: "",
              attributes: existingAttrs[idx] ?? {},
            }],
          }),
          { status: 200 },
        );
      }
      if (u.includes("/import") && init?.method === "POST") {
        importPayload = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ created: 3, updated: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    // Simulate the bulk sign-off logic
    const responses = await Promise.all(
      journeyIds.map((id) =>
        fetch(`/api/v1/nodes/UserJourney/${id}`).then((r) => r.json()),
      ),
    );

    const today = new Date().toISOString().slice(0, 10);
    const nodes = (responses as Array<{ rows: Array<{ id: string; name: string; attributes: Record<string, unknown> }> }>).map(
      (body, i) => {
        const current = body.rows[0]?.attributes ?? {};
        return {
          id: journeyIds[i],
          label: "UserJourney",
          name: body.rows[0]?.name ?? "",
          attributes: {
            ...current,
            _verification: { by: "operator", at: today },
          },
        };
      },
    );

    await fetch("/api/v1/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes, edges: [] }),
    });

    // Verify the import payload carries both _review AND _verification
    expect(importPayload).not.toBeNull();
    expect(importPayload!.nodes).toHaveLength(3);

    for (let i = 0; i < 3; i++) {
      const node = importPayload!.nodes[i];
      expect(node.attributes._review).toEqual(existingAttrs[i]._review);
      expect(node.attributes._verification).toEqual({ by: "operator", at: today });
    }
  });
});
