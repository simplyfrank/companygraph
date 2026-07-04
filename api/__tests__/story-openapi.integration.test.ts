import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "../src/errors";

// story-spec-core T-03 + T-12 / AC-09 (openapi half) — every new route
// path and every one of the FIVE new ERROR_CODES members appears in
// GET /api/v1/openapi.json (generated from the same zod definitions
// used at runtime, FR-10).

const API_BASE = "http://127.0.0.1:8787/api/v1";

const NEW_CODES = [
  "story_not_found",
  "acceptance_criterion_not_found",
  "story_activity_required",
  "story_activity_not_in_model",
  "acceptance_criterion_clause_required",
] as const;

const NEW_PATHS = [
  "/api/v1/models/{modelId}/stories",
  "/api/v1/models/{modelId}/stories/bootstrap",
  "/api/v1/models/{modelId}/stories/{storyId}",
  "/api/v1/models/{modelId}/stories/{storyId}/acceptance-criteria",
  "/api/v1/models/{modelId}/stories/{storyId}/acceptance-criteria/{acId}",
] as const;

// path → methods that must be present.
const METHODS: Record<(typeof NEW_PATHS)[number], string[]> = {
  "/api/v1/models/{modelId}/stories": ["get", "post"],
  "/api/v1/models/{modelId}/stories/bootstrap": ["post"],
  "/api/v1/models/{modelId}/stories/{storyId}": ["get", "patch", "delete"],
  "/api/v1/models/{modelId}/stories/{storyId}/acceptance-criteria": ["get", "post"],
  "/api/v1/models/{modelId}/stories/{storyId}/acceptance-criteria/{acId}": ["patch", "delete"],
};

describe("integration: story-spec-core AC-09 openapi registration", () => {
  test("each of the five new codes is a member of ERROR_CODES", () => {
    for (const code of NEW_CODES) {
      expect(ERROR_CODES as readonly string[]).toContain(code);
    }
    // DD-04: the reserved duplicate code is NOT added.
    expect(ERROR_CODES as readonly string[]).not.toContain("story_duplicate_for_activity");
  });

  test("every new route path + method and all five codes appear in openapi.json", async () => {
    const res = await fetch(`${API_BASE}/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };

    for (const path of NEW_PATHS) {
      expect(doc.paths[path]).toBeDefined();
      for (const method of METHODS[path]) {
        expect(doc.paths[path]![method]).toBeDefined();
      }
    }

    // The five new codes surface in the shared ErrorEnvelope enum.
    const envelope = doc.components.schemas.ErrorEnvelope as {
      properties: { error: { properties: { code: { enum: string[] } } } };
    };
    const codes = envelope.properties.error.properties.code.enum;
    for (const code of NEW_CODES) expect(codes).toContain(code);

    // Story/AC schemas registered from the same zod definitions.
    for (const name of [
      "StoryCreate",
      "StoryPatch",
      "Story",
      "AcceptanceCriterionCreate",
      "AcceptanceCriterionPatch",
      "AcceptanceCriterion",
      "StoryBootstrapRequest",
      "StoryBootstrapResult",
    ]) {
      expect(doc.components.schemas[name]).toBeDefined();
    }
  });
});
