// RDF parser — imports external OWL/RDF ontologies into the ontology registry.
//
// Supports parsing JSON-LD, Turtle, and N-Triples formats to create
// node labels and edge types in the ontology registry.

export interface ParsedOntology {
  classes: Array<{ name: string; description?: string; iri: string }>;
  properties: Array<{ name: string; description?: string; domain: string | undefined; range: string | undefined; iri: string }>;
}

export class RdfParser {
  private baseIri: string;
  private prefix: string;

  constructor(baseIri: string = "http://companygraph/ontology/", prefix: string = "cg") {
    this.baseIri = baseIri;
    this.prefix = prefix;
  }

  parseJsonLd(jsonLd: string): ParsedOntology {
    const data = JSON.parse(jsonLd);
    const graph = data["@graph"] || [data];
    const result: ParsedOntology = { classes: [], properties: [] };

    for (const node of graph) {
      const type = node["@type"];
      const id = node["@id"];

      if (!id) continue;

      const localName = this.extractLocalName(id);

      if (type === "owl:Class" || type === "http://www.w3.org/2002/07/owl#Class") {
        result.classes.push({
          name: localName,
          description: (node["rdfs:comment"] || node["http://www.w3.org/2000/01/rdf-schema#comment"]) as string | undefined,
          iri: id,
        });
      } else if (type === "owl:ObjectProperty" || type === "http://www.w3.org/2002/07/owl#ObjectProperty") {
        const domain = this.extractLocalName(node["rdfs:domain"] || node["http://www.w3.org/2000/01/rdf-schema#domain"]);
        const range = this.extractLocalName(node["rdfs:range"] || node["http://www.w3.org/2000/01/rdf-schema#range"]);
        
        if (domain && range) {
          result.properties.push({
            name: localName,
            description: (node["rdfs:comment"] || node["http://www.w3.org/2000/01/rdf-schema#comment"]) as string | undefined,
            domain: domain || undefined,
            range: range || undefined,
            iri: id,
          });
        }
      }
    }

    return result;
  }

  parseTurtle(turtle: string): ParsedOntology {
    const result: ParsedOntology = { classes: [], properties: [] };
    const lines = turtle.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("@"));

    let currentSubject: string | null = null;
    let currentType: string | null = null;
    let currentLabel: string | null = null;
    let currentComment: string | null = null;
    let currentDomain: string | null = null;
    let currentRange: string | null = null;

    for (const line of lines) {
      // Check for subject declaration
      const subjectMatch = line.match(/^(\S+)\s+rdf:type\s+(\S+)/);
      if (subjectMatch) {
        // Save previous subject if exists
        if (currentSubject && currentType) {
          this.addToResult(result, currentSubject, currentType, currentLabel, currentComment, currentDomain, currentRange);
        }

        currentSubject = subjectMatch[1];
        currentType = subjectMatch[2];
        currentLabel = null;
        currentComment = null;
        currentDomain = null;
        currentRange = null;
        continue;
      }

      // Parse property values
      if (currentSubject) {
        const labelMatch = line.match(/rdfs:label\s+"([^"]+)"/);
        if (labelMatch) {
          currentLabel = labelMatch[1];
        }

        const commentMatch = line.match(/rdfs:comment\s+"([^"]+)"/);
        if (commentMatch) {
          currentComment = commentMatch[1];
        }

        const domainMatch = line.match(/rdfs:domain\s+(\S+)/);
        if (domainMatch) {
          currentDomain = this.extractLocalName(domainMatch[1]);
        }

        const rangeMatch = line.match(/rdfs:range\s+(\S+)/);
        if (rangeMatch) {
          currentRange = this.extractLocalName(rangeMatch[1]);
        }
      }
    }

    // Save last subject
    if (currentSubject && currentType) {
      this.addToResult(result, currentSubject, currentType, currentLabel, currentComment, currentDomain, currentRange);
    }

    return result;
  }

  parseNTriples(ntriples: string): ParsedOntology {
    const result: ParsedOntology = { classes: [], properties: [] };
    const lines = ntriples.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

    const subjects: Map<string, { type: string; label?: string; comment?: string; domain?: string; range?: string }> = new Map();

    for (const line of lines) {
      const match = line.match(/^<([^>]+)>\s+<([^>]+)>\s+(.+)\s+\.$/);
      if (!match) continue;

      const subject = match[1];
      const predicate = match[2];
      const object = match[3];

      if (!subjects.has(subject)) {
        subjects.set(subject, { type: "" });
      }

      const data = subjects.get(subject);
      if (!data) continue;

      if (predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") {
        data.type = object;
      } else if (predicate === "http://www.w3.org/2000/01/rdf-schema#label") {
        const labelMatch = object.match(/^"([^"]*)"/);
        if (labelMatch) data.label = labelMatch[1];
      } else if (predicate === "http://www.w3.org/2000/01/rdf-schema#comment") {
        const commentMatch = object.match(/^"([^"]*)"/);
        if (commentMatch) data.comment = commentMatch[1];
      } else if (predicate === "http://www.w3.org/2000/01/rdf-schema#domain") {
        data.domain = this.extractLocalName(object) || undefined;
      } else if (predicate === "http://www.w3.org/2000/01/rdf-schema#range") {
        data.range = this.extractLocalName(object) || undefined;
      }
    }

    for (const [iri, data] of subjects.entries()) {
      this.addToResult(result, iri, data.type, data.label, data.comment, data.domain, data.range);
    }

    return result;
  }

  private addToResult(
    result: ParsedOntology,
    iri: string,
    type: string,
    label: string | null,
    comment: string | null,
    domain: string | null,
    range: string | null,
  ): void {
    const localName = this.extractLocalName(iri) || label || iri;

    if (type === "owl:Class" || type === "http://www.w3.org/2002/07/owl#Class") {
      result.classes.push({
        name: localName,
        description: comment || label,
        iri,
      });
    } else if (type === "owl:ObjectProperty" || type === "http://www.w3.org/2002/07/owl#ObjectProperty") {
      if (domain && range) {
        result.properties.push({
          name: localName,
          description: comment || label,
          domain,
          range,
          iri,
        });
      }
    }
  }

  private extractLocalName(iri: string): string | null {
    if (!iri) return null;
    
    // Handle prefixed names like "cg:ClassName"
    const prefixedMatch = iri.match(/^(\w+):(\w+)$/);
    if (prefixedMatch) {
      return prefixedMatch[2];
    }

    // Handle full IRIs like "http://companygraph/ontology/ClassName"
    const iriMatch = iri.match(/\/([^\/]+)$/);
    if (iriMatch) {
      return iriMatch[1];
    }

    return null;
  }
}

export function parseRdfJsonLd(jsonLd: string, baseIri?: string): ParsedOntology {
  const parser = new RdfParser(baseIri);
  return parser.parseJsonLd(jsonLd);
}

export function parseRdfTurtle(turtle: string, baseIri?: string): ParsedOntology {
  const parser = new RdfParser(baseIri);
  return parser.parseTurtle(turtle);
}

export function parseRdfNTriples(ntriples: string, baseIri?: string): ParsedOntology {
  const parser = new RdfParser(baseIri);
  return parser.parseNTriples(ntriples);
}
