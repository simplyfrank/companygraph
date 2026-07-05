// requirements-export T-04 (FR-01..FR-04, FR-06) — spec-export route
// handler + default in-process SectionReader seam (OQ-1 pinned).
// Auth is the central router gate (router.ts + ROUTE_PERMISSIONS) —
// never per-route (house rule NFR-05). All bodies zod-validated at
// the boundary; errors ride the standard {error:{code,message,details?}}
// envelope.

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { getModel } from "../storage/models";
import { handleStoryList } from "./stories";
import { handleKeyActivityScores } from "./key-activities";
import { handleCapabilityList, handleGaps, handleContextMap } from "./capabilities";
import { ok, error, parseWith } from "./_helpers";
import { ValidationError } from "../errors";
import {
  specExportQuerySchema,
  exportFormatSchema,
  type SpecDocument,
  type ModelSummary,
  type StoryWithAcs,
  type KeyActivityRow,
  type KpiImpactSection,
  type SystemModelSection,
} from "@companygraph/shared/schema/spec-export";
import {
  assembleSpecDocument,
  type SectionReader,
} from "../derive/spec-document";
import { renderSpecMarkdown } from "../derive/spec-markdown";

// ---------------------------------------------------------------------------
// Default SectionReader (OQ-1 pinned) — in-process handler composition.
// Each reader imports the upstream route's exported handler and calls it
// with :modelId against the same driver. No HTTP self-loopback, no router
// re-gate, no direct store query for domain data (FR-02, NFR-02).
// ---------------------------------------------------------------------------

// Helper: unwrap a Response body into JSON.
async function unwrap<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

const defaultReaders: SectionReader = {
  async readModel(driver: Driver, modelId: string): Promise<ModelSummary> {
    const model = await getModel(driver, modelId);
    return {
      id: model.id,
      name: model.name,
      description: model.description,
      isReference: model.isReference,
    };
  },

  async readStories(driver: Driver, modelId: string): Promise<StoryWithAcs[]> {
    // Call the upstream handler in-process (OQ-1). The handler returns
    // a Response with the story list; each story's detail includes ACs.
    const res = await handleStoryList(new Request("http://localhost/"), modelId);
    const stories = await unwrap<StoryWithAcs[]>(res);
    // The list endpoint returns stories without embedded ACs; fetch
    // each story's detail to get the ACs. This is acceptable because
    // the export is a read-only aggregate (NFR-04: bounded live compute).
    // If the list already includes ACs (acceptanceCriteria is present),
    // use them as-is.
    if (stories.length > 0 && stories[0]?.acceptanceCriteria) {
      return stories;
    }
    // Fetch detail for each story to embed ACs.
    const { handleStoryGet } = await import("./stories");
    const detailed = await Promise.all(
      stories.map(async (s) => {
        const detail = await unwrap<StoryWithAcs>(
          await handleStoryGet(new Request("http://localhost/"), modelId, s.id),
        );
        return detail;
      }),
    );
    return detailed;
  },

  async readKeyActivities(driver: Driver, modelId: string): Promise<KeyActivityRow[]> {
    const res = await handleKeyActivityScores(new Request("http://localhost/"), modelId);
    const body = await unwrap<{ rows: KeyActivityRow[] }>(res);
    return body.rows;
  },

  async readKpiImpact(_driver: Driver, _modelId: string): Promise<KpiImpactSection> {
    // kpi-impact-mapping has not landed yet — this reader will throw,
    // which the assembler catches and degrades (FR-03). Once the
    // upstream routes exist, replace this with in-process handler calls
    // to the matrix + rollup endpoints.
    throw new Error("kpi-impact-mapping routes not yet available");
  },

  async readSystemModel(driver: Driver, modelId: string): Promise<SystemModelSection> {
    const capRes = await handleCapabilityList(new Request("http://localhost/"), modelId);
    const capabilities = await unwrap<SystemModelSection["capabilities"]>(capRes);

    const gapsRes = await handleGaps(new Request("http://localhost/"), modelId);
    const gaps = await unwrap<SystemModelSection["gaps"]>(gapsRes);

    const ctxRes = await handleContextMap(new Request("http://localhost/"), modelId);
    const contextMap = await unwrap<SystemModelSection["contextMap"]>(ctxRes);

    return { capabilities, gaps, contextMap };
  },
};

// ---------------------------------------------------------------------------
// Route handler (T-04)
// ---------------------------------------------------------------------------

export async function handleSpecExport(req: Request, modelId: string): Promise<Response> {
  // 1. Model existence pre-check (fast-fail, FR-01).
  try {
    await getModel(getDriver(), modelId);
  } catch {
    return error(404, "model_not_found", "model_not_found", { modelId });
  }

  // 2. Format negotiation (FR-04).
  const url = new URL(req.url);
  const queryFormat = url.searchParams.get("format");
  const acceptHeader = req.headers.get("accept") ?? "";

  let format: "json" | "markdown";

  if (queryFormat !== null) {
    // Query param wins on conflict.
    const parsed = exportFormatSchema.safeParse(queryFormat);
    if (!parsed.success) {
      throw new ValidationError("unsupported_export_format", { provided: queryFormat });
    }
    format = parsed.data;
  } else if (acceptHeader.includes("text/markdown")) {
    format = "markdown";
  } else {
    format = "json"; // default
  }

  // 3. Assemble via the default in-process readers (OQ-1).
  const doc = await assembleSpecDocument(modelId, defaultReaders, getDriver());

  // 4. Format response.
  if (format === "markdown") {
    const md = renderSpecMarkdown(doc);
    return new Response(md, {
      status: 200,
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  }

  return ok(doc);
}

// ---------------------------------------------------------------------------
// Dispatch delegate — called from router.ts AFTER the other model-scoped
// blocks. Specific-before-parameterized so the 3-segment spec-export
// route never collides with model-workspace-core's 2-segment models/:id.
// ---------------------------------------------------------------------------

export async function registerSpecExportRoutes(
  method: string,
  sub: string,
  req: Request,
): Promise<Response | null> {
  const match = sub.match(/^models\/([^/]+)\/spec-export$/);
  if (match && method === "GET") return handleSpecExport(req, match[1]!);
  return null;
}
