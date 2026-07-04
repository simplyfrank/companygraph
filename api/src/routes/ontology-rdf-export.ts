// OWL/RDF export API routes — exports ontology registry to RDF formats.
//
// Supports JSON-LD, Turtle, and N-Triples serialization for interoperability
// with external ontology tools and standards.

import { getDriver } from "../neo4j/driver";
import { listNodeLabels } from "../ontology/storage/node-labels";
import { listEdgeTypes } from "../ontology/storage/edge-types";
import {
  serializeToJsonLd,
  serializeToTurtle,
  serializeToNTriples,
} from "../ontology/rdf/serializer";
import { ok, error } from "./_helpers";

export async function handleRdfExport(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "jsonld";

  try {
    const nodeLabels = await listNodeLabels(driver);
    const edgeTypes = await listEdgeTypes(driver);

    // Convert readonly arrays to mutable for serializer
    const nodeLabelsMutable = nodeLabels.map((nl) => ({
      name: nl.name,
      json_schema_doc: typeof nl.json_schema_doc === "string" ? nl.json_schema_doc : JSON.stringify(nl.json_schema_doc),
    }));

    // Edge types have endpoints array, need to flatten to individual properties
    const edgeTypesMutable: Array<{ name: string; from_label: string; to_label: string; json_schema_doc: string }> = [];
    for (const et of edgeTypes) {
      for (const endpoint of et.endpoints) {
        edgeTypesMutable.push({
          name: et.name,
          from_label: endpoint.fromLabel,
          to_label: endpoint.toLabel,
          json_schema_doc: JSON.stringify({ description: et.description, usage_example: et.usage_example }),
        });
      }
    }

    let content: string;
    let contentType: string;

    switch (format.toLowerCase()) {
      case "jsonld":
        content = serializeToJsonLd(nodeLabelsMutable, edgeTypesMutable);
        contentType = "application/ld+json";
        break;
      case "turtle":
      case "ttl":
        content = serializeToTurtle(nodeLabelsMutable, edgeTypesMutable);
        contentType = "text/turtle";
        break;
      case "ntriples":
      case "nt":
        content = serializeToNTriples(nodeLabelsMutable, edgeTypesMutable);
        contentType = "application/n-triples";
        break;
      default:
        return error(400, "invalid_payload", "Invalid format. Supported formats: jsonld, turtle, ntriples");
    }

    return new Response(content, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="ontology.${format}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return error(500, "neo4j_unreachable", "Failed to export ontology", { cause: message });
  }
}
