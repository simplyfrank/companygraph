import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "../src/errors";

// key-activity-optimizer T-07 + T-10 / AC-08 (openapi half of the
// two-file split — the scope+authz half is
// key-activity-scope-authz.integration.test.ts; both must exist,
// design §8 N-03) — the three key-activity route paths and the ONE new
// `activity_not_found` code appear in GET /api/v1/openapi.json,
// generated from the same T-01 zod definitions used at runtime (FR-10);
// the mark/unmark 404s document the combined
// `model_not_found | activity_not_found` (cold-pass B-01 sequencing,
// the story routes' convention).

const API_BASE = "http://127.0.0.1:8787/api/v1";

const SCORES_PATH = "/api/v1/models/{modelId}/key-activities";
const MARK_PATH = "/api/v1/models/{modelId}/key-activities/{activityId}/mark";

describe("integration: key-activity-optimizer AC-08 openapi registration", () => {
  test("activity_not_found is a member of ERROR_CODES; model_not_found was NOT re-added", () => {
    expect(ERROR_CODES as readonly string[]).toContain("activity_not_found");
    expect(
      (ERROR_CODES as readonly string[]).filter((c) => c === "model_not_found"),
    ).toHaveLength(1);
  });

  test("the three routes + the new code appear in openapi.json with the combined 404 docs", async () => {
    const res = await fetch(`${API_BASE}/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      paths: Record<string, Record<string, { responses: Record<string, { description: string }> }>>;
      components: { schemas: Record<string, unknown> };
    };

    expect(doc.paths[SCORES_PATH]).toBeDefined();
    expect(doc.paths[SCORES_PATH]!.get).toBeDefined();
    expect(doc.paths[MARK_PATH]).toBeDefined();
    expect(doc.paths[MARK_PATH]!.post).toBeDefined();
    expect(doc.paths[MARK_PATH]!.delete).toBeDefined();

    // 404 documentation: GET → model_not_found; mark/unmark → the
    // combined model_not_found | activity_not_found convention.
    expect(doc.paths[SCORES_PATH]!.get!.responses["404"]!.description).toBe("model_not_found");
    expect(doc.paths[MARK_PATH]!.post!.responses["404"]!.description).toBe(
      "model_not_found | activity_not_found",
    );
    expect(doc.paths[MARK_PATH]!.delete!.responses["404"]!.description).toBe(
      "model_not_found | activity_not_found",
    );

    // The new code surfaces in the shared ErrorEnvelope enum.
    const envelope = doc.components.schemas.ErrorEnvelope as {
      properties: { error: { properties: { code: { enum: string[] } } } };
    };
    expect(envelope.properties.error.properties.code.enum).toContain("activity_not_found");

    // Key-activity schemas registered from the same zod definitions.
    for (const name of [
      "KeyActivitySubScores",
      "KeyActivityMark",
      "KeyActivityScoreRow",
      "KeyActivityScores",
    ]) {
      expect(doc.components.schemas[name]).toBeDefined();
    }
  });
});
