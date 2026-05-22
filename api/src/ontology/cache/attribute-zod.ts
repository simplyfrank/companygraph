// T-13 — Per-label attribute zod-validator cache (design §6.3 + FR-04).
//
// Cache key: node-label name. Cache value: compiled `z.ZodTypeAny`.
// Lazy (no pre-warm); unbounded (one entry per registered label — bounded
// by the registry's label count, not by the data graph's size).
//
// The compiled validator is what graph-core's `storage/nodes.ts` (T-15)
// calls before every `createNode` / `patchNode` / `upsertNode` write:
//
//   const validator = await getAttributeValidator(label);
//   const parse = validator.safeParse(input.attributes ?? {});
//   if (!parse.success) ERROR_CODE_THROWERS.attribute_violation(…);
//
// `json-schema-to-zod` returns a STRING of zod source code (the package
// is primarily a codegen tool). To get a runtime `ZodTypeAny`, we
// evaluate the generated expression via `new Function("z", ...)`. The
// input is a JSON Schema document that was already validated by
// `jsonSchemaDocSchema` (shared/src/schema/ontology.ts) at register
// time — strict `.strict()` mode rejects every unsupported keyword
// before any string ever reaches this module, so the eval surface is
// limited to the validated supported subset.
//
// Uniform global invalidation (pass-1 C-01).

import type { Driver } from "neo4j-driver";
import { z } from "zod";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { getDriver } from "../../neo4j/driver";
import { ontologyEvents } from "../events";
import { ERROR_CODE_THROWERS } from "../error-throwers";

const cache = new Map<string, z.ZodTypeAny>();

ontologyEvents.on("ontology.changed", () => cache.clear());

async function loadAttributeSchemaFromRegistry(
  driver: Driver,
  label: string,
): Promise<unknown> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (l:_OntologyNodeLabel {name: $name})<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
       RETURN s.json_schema_doc AS jsd`,
      { name: label },
    );
    if (r.records.length === 0) {
      ERROR_CODE_THROWERS.not_found({ name: label, kind: "node_label" });
    }
    const jsdRaw = r.records[0]!.get("jsd") as string | null;
    return jsdRaw != null ? JSON.parse(jsdRaw) : {};
  } finally {
    await session.close();
  }
}

function compileToZod(jsonSchemaDoc: unknown): z.ZodTypeAny {
  // `jsonSchemaToZod` defaults emit a complete `import` + `export` block;
  // we want just the expression. `module: "none"` strips both.
  const code = jsonSchemaToZod(jsonSchemaDoc as never, {
    module: "none",
    // The package's runtime-friendly variant — emits zod v3 calls that
    // the bundled `z` accepts. `withJsdocs` etc. default to off.
  });
  // `code` is e.g. `z.object({ sku: z.string() })`. We need a value, so
  // wrap with `return`.
  // eslint-disable-next-line no-new-func
  const builder = new Function("z", `return ${code};`) as (
    z: typeof import("zod").z,
  ) => z.ZodTypeAny;
  return builder(z);
}

export async function getAttributeValidator(
  label: string,
  driverOverride?: Driver,
): Promise<z.ZodTypeAny> {
  const hit = cache.get(label);
  if (hit) return hit;
  const driver = driverOverride ?? getDriver();
  const json_schema_doc = await loadAttributeSchemaFromRegistry(driver, label);
  const compiled = compileToZod(json_schema_doc);
  cache.set(label, compiled);
  return compiled;
}

// Test-only.
export function _peekAttributeZodCache(label: string): z.ZodTypeAny | undefined {
  return cache.get(label);
}

export function _clearAttributeZodCache(): void {
  cache.clear();
}
