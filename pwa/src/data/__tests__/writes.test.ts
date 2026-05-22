import { describe, test, expect, beforeEach, vi } from "vitest";
import { mergeAttributes, ClientError } from "../writes";

describe("writes.mergeAttributes (RMW)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("preserves prior attribute keys when patching one sub-object", async () => {
    const prior = {
      _verification: { by: "role-1", at: "2026-05-20" },
      custom: "keep me",
    };
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init: init as RequestInit | undefined });
      if (!init || init.method === undefined || init.method === "GET") {
        return new Response(
          JSON.stringify({
            rows: [
              { id: "j-1", name: "J", description: "", attributes: prior },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await mergeAttributes("UserJourney", "j-1", {
      _review: { status: "needs_review", reason: "test", set_by: "operator", set_at: "2026-05-23" },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.init?.method ?? "GET").toMatch(/^GET$|^undefined$/);
    expect(calls[1]?.init?.method).toBe("PATCH");
    const patchBody = JSON.parse(String(calls[1]?.init?.body));
    expect(patchBody.attributes._verification).toEqual(prior._verification);
    expect(patchBody.attributes.custom).toBe("keep me");
    expect(patchBody.attributes._review.status).toBe("needs_review");
  });

  test("throws ClientError when the GET fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found", message: "x" } }), {
        status: 404,
      }),
    );
    await expect(mergeAttributes("UserJourney", "missing", {})).rejects.toBeInstanceOf(
      ClientError,
    );
  });

  test("throws ClientError when the PATCH fails (with code from envelope)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (!init || init.method === undefined || init.method === "GET") {
        return new Response(
          JSON.stringify({ rows: [{ id: "j-1", name: "J", description: "", attributes: {} }] }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ error: { code: "validation_error", message: "bad" } }),
        { status: 400 },
      );
    });
    await expect(
      mergeAttributes("UserJourney", "j-1", { _review: {} }),
    ).rejects.toMatchObject({ code: "validation_error", status: 400 });
  });
});
