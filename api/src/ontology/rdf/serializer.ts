// RDF serializer — converts ontology registry to RDF formats (JSON-LD, Turtle, N-Triples).
//
// Supports serialization of node labels and edge types from the ontology registry
// into standard RDF formats for interoperability with external tools.

export interface RdfTriple {
  subject: string;
  predicate: string;
  object: string;
  datatype?: string;
  language?: string;
}

export interface RdfContext {
  "@context": Record<string, string>;
  "@id": string;
  "@type": string;
  [key: string]: unknown;
}

export class RdfSerializer {
  private baseIri: string;
  private prefix: string;

  constructor(baseIri: string = "http://companygraph/ontology/", prefix: string = "cg") {
    this.baseIri = baseIri;
    this.prefix = prefix;
  }

  toJsonLd(nodeLabels: Array<{ name: string; json_schema_doc: string }>, edgeTypes: Array<{ name: string; from_label: string; to_label: string; json_schema_doc: string }>): string {
    const context: Record<string, string> = {
      "@base": this.baseIri,
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      owl: "http://www.w3.org/2002/07/owl#",
      xsd: "http://www.w3.org/2001/XMLSchema#",
      cg: this.baseIri,
    };

    const graph: RdfContext[] = [];

    // Serialize node labels as OWL classes
    for (const nodeLabel of nodeLabels) {
      const classNode: RdfContext = {
        "@context": context,
        "@id": `${this.prefix}:${nodeLabel.name}`,
        "@type": "owl:Class",
        "rdfs:label": nodeLabel.name,
      };

      // Add schema documentation if available
      if (nodeLabel.json_schema_doc) {
        try {
          const schema = JSON.parse(nodeLabel.json_schema_doc);
          if (schema.description) {
            classNode["rdfs:comment"] = schema.description;
          }
        } catch {
          // Ignore parse errors
        }
      }

      graph.push(classNode);
    }

    // Serialize edge types as OWL properties
    for (const edgeType of edgeTypes) {
      const propertyNode: RdfContext = {
        "@context": context,
        "@id": `${this.prefix}:${edgeType.name}`,
        "@type": "owl:ObjectProperty",
        "rdfs:label": edgeType.name,
        "rdfs:domain": `${this.prefix}:${edgeType.from_label}`,
        "rdfs:range": `${this.prefix}:${edgeType.to_label}`,
      };

      // Add schema documentation if available
      if (edgeType.json_schema_doc) {
        try {
          const schema = JSON.parse(edgeType.json_schema_doc);
          if (schema.description) {
            propertyNode["rdfs:comment"] = schema.description;
          }
        } catch {
          // Ignore parse errors
        }
      }

      graph.push(propertyNode);
    }

    const jsonLd: Record<string, unknown> = {
      "@context": context,
      "@graph": graph,
    };

    return JSON.stringify(jsonLd, null, 2);
  }

  toTurtle(nodeLabels: Array<{ name: string; json_schema_doc: string }>, edgeTypes: Array<{ name: string; from_label: string; to_label: string; json_schema_doc: string }>): string {
    const lines: string[] = [];

    // Prefix declarations
    lines.push(`@base <${this.baseIri}> .`);
    lines.push("@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .");
    lines.push("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .");
    lines.push("@prefix owl: <http://www.w3.org/2002/07/owl#> .");
    lines.push("@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .");
    lines.push(`@prefix ${this.prefix}: <${this.baseIri}> .`);
    lines.push("");

    // Ontology declaration
    lines.push(`<${this.baseIri}> rdf:type owl:Ontology .`);
    lines.push("");

    // Serialize node labels as OWL classes
    for (const nodeLabel of nodeLabels) {
      lines.push(`${this.prefix}:${nodeLabel.name} rdf:type owl:Class ;`);
      lines.push(`    rdfs:label "${this.escapeString(nodeLabel.name)}" ;`);

      // Add schema documentation if available
      if (nodeLabel.json_schema_doc) {
        try {
          const schema = JSON.parse(nodeLabel.json_schema_doc);
          if (schema.description) {
            lines.push(`    rdfs:comment "${this.escapeString(schema.description)}" ;`);
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Remove trailing semicolon from last line
      const lastLine = lines[lines.length - 1];
      if (lastLine) {
        lines[lines.length - 1] = lastLine.replace(" ;", " .");
      }
      lines.push("");
    }

    // Serialize edge types as OWL properties
    for (const edgeType of edgeTypes) {
      lines.push(`${this.prefix}:${edgeType.name} rdf:type owl:ObjectProperty ;`);
      lines.push(`    rdfs:label "${this.escapeString(edgeType.name)}" ;`);
      lines.push(`    rdfs:domain ${this.prefix}:${edgeType.from_label} ;`);
      lines.push(`    rdfs:range ${this.prefix}:${edgeType.to_label} ;`);

      // Add schema documentation if available
      if (edgeType.json_schema_doc) {
        try {
          const schema = JSON.parse(edgeType.json_schema_doc);
          if (schema.description) {
            lines.push(`    rdfs:comment "${this.escapeString(schema.description)}" ;`);
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Remove trailing semicolon from last line
      const lastLine = lines[lines.length - 1];
      if (lastLine) {
        lines[lines.length - 1] = lastLine.replace(" ;", " .");
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  toNTriples(nodeLabels: Array<{ name: string; json_schema_doc: string }>, edgeTypes: Array<{ name: string; from_label: string; to_label: string; json_schema_doc: string }>): string {
    const triples: RdfTriple[] = [];

    // Ontology declaration
    triples.push({
      subject: `<${this.baseIri}>`,
      predicate: "<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>",
      object: "<http://www.w3.org/2002/07/owl#Ontology>",
    });

    // Serialize node labels as OWL classes
    for (const nodeLabel of nodeLabels) {
      const classIri = `<${this.baseIri}${nodeLabel.name}>`;
      
      triples.push({
        subject: classIri,
        predicate: "<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>",
        object: "<http://www.w3.org/2002/07/owl#Class>",
      });

      triples.push({
        subject: classIri,
        predicate: "<http://www.w3.org/2000/01/rdf-schema#label>",
        object: `"${this.escapeNtriplesString(nodeLabel.name)}"`,
        datatype: "<http://www.w3.org/2001/XMLSchema#string>",
      });

      // Add schema documentation if available
      if (nodeLabel.json_schema_doc) {
        try {
          const schema = JSON.parse(nodeLabel.json_schema_doc);
          if (schema.description) {
            triples.push({
              subject: classIri,
              predicate: "<http://www.w3.org/2000/01/rdf-schema#comment>",
              object: `"${this.escapeNtriplesString(schema.description)}"`,
              datatype: "<http://www.w3.org/2001/XMLSchema#string>",
            });
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Serialize edge types as OWL properties
    for (const edgeType of edgeTypes) {
      const propertyIri = `<${this.baseIri}${edgeType.name}>`;
      const domainIri = `<${this.baseIri}${edgeType.from_label}>`;
      const rangeIri = `<${this.baseIri}${edgeType.to_label}>`;

      triples.push({
        subject: propertyIri,
        predicate: "<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>",
        object: "<http://www.w3.org/2002/07/owl#ObjectProperty>",
      });

      triples.push({
        subject: propertyIri,
        predicate: "<http://www.w3.org/2000/01/rdf-schema#label>",
        object: `"${this.escapeNtriplesString(edgeType.name)}"`,
        datatype: "<http://www.w3.org/2001/XMLSchema#string>",
      });

      triples.push({
        subject: propertyIri,
        predicate: "<http://www.w3.org/2000/01/rdf-schema#domain>",
        object: domainIri,
      });

      triples.push({
        subject: propertyIri,
        predicate: "<http://www.w3.org/2000/01/rdf-schema#range>",
        object: rangeIri,
      });

      // Add schema documentation if available
      if (edgeType.json_schema_doc) {
        try {
          const schema = JSON.parse(edgeType.json_schema_doc);
          if (schema.description) {
            triples.push({
              subject: propertyIri,
              predicate: "<http://www.w3.org/2000/01/rdf-schema#comment>",
              object: `"${this.escapeNtriplesString(schema.description)}"`,
              datatype: "<http://www.w3.org/2001/XMLSchema#string>",
            });
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Convert triples to N-Triples format
    return triples
      .map((t) => {
        let line = `${t.subject} ${t.predicate} ${t.object}`;
        if (t.datatype) {
          line = line.replace(/"([^"]*)"/, `$1^^${t.datatype}`);
        }
        if (t.language) {
          line = line.replace(/"([^"]*)"/, `$1@${t.language}`);
        }
        return `${line} .`;
      })
      .join("\n");
  }

  private escapeString(str: string): string {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }

  private escapeNtriplesString(str: string): string {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }
}

export function serializeToJsonLd(
  nodeLabels: Array<{ name: string; json_schema_doc: string }>,
  edgeTypes: Array<{ name: string; from_label: string; to_label: string; json_schema_doc: string }>,
  baseIri?: string,
): string {
  const serializer = new RdfSerializer(baseIri);
  return serializer.toJsonLd(nodeLabels, edgeTypes);
}

export function serializeToTurtle(
  nodeLabels: Array<{ name: string; json_schema_doc: string }>,
  edgeTypes: Array<{ name: string; from_label: string; to_label: string; json_schema_doc: string }>,
  baseIri?: string,
): string {
  const serializer = new RdfSerializer(baseIri);
  return serializer.toTurtle(nodeLabels, edgeTypes);
}

export function serializeToNTriples(
  nodeLabels: Array<{ name: string; json_schema_doc: string }>,
  edgeTypes: Array<{ name: string; from_label: string; to_label: string; json_schema_doc: string }>,
  baseIri?: string,
): string {
  const serializer = new RdfSerializer(baseIri);
  return serializer.toNTriples(nodeLabels, edgeTypes);
}
