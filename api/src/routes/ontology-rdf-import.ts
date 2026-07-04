// OWL/RDF import API routes — imports external ontologies into the registry.
//
// Supports JSON-LD, Turtle, and N-Triples formats for importing
// external ontology definitions as node labels and edge types.
//
// ARCHITECTURAL-DEBT: This route calls createNodeLabel / createEdgeType in
// separate loops. Each storage function opens its own executeWrite transaction.
// A partial failure (e.g., class A succeeds but property B fails) leaves the
// registry in an inconsistent state. True atomicity requires refactoring the
// storage layer to accept an injected tx (see ARCHITECTURE.md open-debt #1).

import { getDriver } from "../neo4j/driver";
import { createNodeLabel } from "../ontology/storage/node-labels";
import { createEdgeType } from "../ontology/storage/edge-types";
import {
  parseRdfJsonLd,
  parseRdfTurtle,
  parseRdfNTriples,
} from "../ontology/rdf/parser";
import { ok, error, readJson } from "./_helpers";
import { ontologyEvents } from "../ontology/events";

export async function handleRdfImport(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "jsonld";
  const actor = "system"; // TODO: Get from auth context

  try {
    const body = await readJson(req);
    const content = body.content as string;

    if (!content) {
      return error(400, "invalid_payload", "Missing content field");
    }

    let parsed: { classes: Array<{ name: string; description?: string; iri: string }>; properties: Array<{ name: string; description?: string; domain: string; range: string; iri: string }> };

    switch (format.toLowerCase()) {
      case "jsonld":
        parsed = parseRdfJsonLd(content);
        break;
      case "turtle":
      case "ttl":
        parsed = parseRdfTurtle(content);
        break;
      case "ntriples":
      case "nt":
        parsed = parseRdfNTriples(content);
        break;
      default:
        return error(400, "invalid_payload", "Invalid format. Supported formats: jsonld, turtle, ntriples");
    }

    const results = {
      classes_created: 0,
      properties_created: 0,
      errors: [] as string[],
    };

    // Create node labels for classes
    for (const cls of parsed.classes) {
      try {
        await createNodeLabel(
          driver,
          {
            name: cls.name,
            description: cls.description || "",
            usage_example: "",
            json_schema_doc: JSON.stringify({ description: cls.description }),
            external_alignment: [{ source: "rdf_import", id: cls.iri }],
          },
          actor,
        );
        results.classes_created++;
      } catch (e) {
        results.errors.push(`Failed to create class ${cls.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Create edge types for properties
    for (const prop of parsed.properties) {
      try {
        await createEdgeType(
          driver,
          {
            name: prop.name,
            description: prop.description || "",
            usage_example: "",
            endpoints: [{ fromLabel: prop.domain, toLabel: prop.range }],
            external_alignment: [{ source: "rdf_import", id: prop.iri }],
          },
          actor,
        );
        results.properties_created++;
      } catch (e) {
        results.errors.push(`Failed to create property ${prop.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Only emit cache invalidation if the import fully succeeded.
    if (results.errors.length === 0) {
      ontologyEvents.emit();
    }
    return ok(results);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return error(500, "neo4j_unreachable", "Failed to import ontology", { cause: message });
  }
}
