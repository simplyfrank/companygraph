// OWL Turtle parser — converts OWL Turtle format to ontology definitions.
//
// Simplified parser for OWL Turtle format, focused on extracting class and property definitions.
// This is a basic implementation that handles common OWL constructs used in ontology generation.

import type { OwlClass, OwlProperty } from "@companygraph/shared/schema/ontology";

export interface ParsedOntology {
  classes: OwlClass[];
  properties: OwlProperty[];
  prefixes: Record<string, string>;
}

export class OwlParser {
  private content: string;
  private lines: string[];
  private position: number;
  private prefixes: Record<string, string>;

  constructor(content: string) {
    this.content = content;
    this.lines = content.split("\n");
    this.position = 0;
    this.prefixes = {};
  }

  parse(): ParsedOntology {
    const classes: OwlClass[] = [];
    const properties: OwlProperty[] = [];

    while (this.position < this.lines.length) {
      const line = this.lines[this.position]?.trim();
      if (!line) {
        this.position++;
        continue;
      }

      // Skip empty lines and comments
      if (!line || line.startsWith("#")) {
        this.position++;
        continue;
      }

      // Parse prefix declarations
      if (line.startsWith("@prefix")) {
        this.parsePrefix();
        continue;
      }

      // Parse class or property declarations
      if (line.includes("rdf:type owl:Class")) {
        const cls = this.parseClass();
        if (cls) classes.push(cls);
      } else if (
        line.includes("rdf:type owl:ObjectProperty") ||
        line.includes("rdf:type owl:DatatypeProperty") ||
        line.includes("rdf:type owl:AnnotationProperty")
      ) {
        const prop = this.parseProperty();
        if (prop) properties.push(prop);
      }

      this.position++;
    }

    return { classes, properties, prefixes: this.prefixes };
  }

  private parsePrefix(): void {
    const line = this.lines[this.position]?.trim();
    if (!line) return;
    const match = line.match(/@prefix\s+(\w+):\s*<([^>]+)>/);
    if (match && match[1] && match[2]) {
      this.prefixes[match[1]] = match[2];
    }
  }

  private parseClass(): OwlClass | null {
    const startLine = this.position;
    const lines: string[] = [];

    // Collect all lines for this class definition
    while (this.position < this.lines.length) {
      const line = this.lines[this.position]?.trim();
      if (!line) break;
      lines.push(line);

      if (line.endsWith(".")) {
        break;
      }
      this.position++;
    }

    const content = lines.join("\n");

    // Extract IRI from first line
    const iriMatch = content.match(/(\w+):(\w+)\s+rdf:type\s+owl:Class/);
    if (!iriMatch) return null;

    const prefix = this.prefixes[iriMatch[1] || ""] || "";
    const localName = iriMatch[2] || "";
    const iri = `${prefix}${localName}`;

    // Extract label
    const labelMatch = content.match(/rdfs:label\s+"([^"]+)"/);
    const label = labelMatch ? labelMatch[1] : localName;

    // Extract comment/description
    const commentMatch = content.match(/rdfs:comment\s+"([^"]+)"/);
    const description = commentMatch ? commentMatch[1] : undefined;

    // Extract super classes
    const superClasses: string[] = [];
    const superClassMatch = content.match(/rdfs:subClassOf\s+([^;]+)/);
    if (superClassMatch && superClassMatch[1]) {
      const superClassContent = superClassMatch[1];
      const classMatches = superClassContent.matchAll(/(\w+):(\w+)/g);
      for (const match of classMatches) {
        const scPrefix = this.prefixes[match[1] || ""] || "";
        superClasses.push(`${scPrefix}${match[2] || ""}`);
      }
    }

    // Extract equivalent classes
    const equivalentClasses: string[] = [];
    const equivMatch = content.match(/owl:equivalentClass\s+([^;]+)/);
    if (equivMatch && equivMatch[1]) {
      const equivContent = equivMatch[1];
      const classMatches = equivContent.matchAll(/(\w+):(\w+)/g);
      for (const match of classMatches) {
        const ecPrefix = this.prefixes[match[1] || ""] || "";
        equivalentClasses.push(`${ecPrefix}${match[2] || ""}`);
      }
    }

    // Extract disjoint with
    const disjointWith: string[] = [];
    const disjointMatch = content.match(/owl:disjointWith\s+([^;]+)/);
    if (disjointMatch && disjointMatch[1]) {
      const disjointContent = disjointMatch[1];
      const classMatches = disjointContent.matchAll(/(\w+):(\w+)/g);
      for (const match of classMatches) {
        const dPrefix = this.prefixes[match[1] || ""] || "";
        disjointWith.push(`${dPrefix}${match[2] || ""}`);
      }
    }

    // Extract annotations
    const annotations: Record<string, string> = {};
    const annotationMatches = content.matchAll(/(\w+):(\w+)\s+"([^"]+)"/g);
    for (const match of annotationMatches) {
      // Skip standard RDF/OWL properties
      if (match[1] && ["rdf", "rdfs", "owl"].includes(match[1])) continue;
      if (match[2] && match[3]) {
        annotations[match[2]] = match[3];
      }
    }

    return {
      iri,
      label,
      description,
      super_classes: superClasses,
      equivalent_classes: equivalentClasses,
      disjoint_with: disjointWith,
      annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
    };
  }

  private parseProperty(): OwlProperty | null {
    const startLine = this.position;
    const lines: string[] = [];

    // Collect all lines for this property definition
    while (this.position < this.lines.length) {
      const line = this.lines[this.position]?.trim();
      if (!line) break;
      lines.push(line);

      if (line.endsWith(".")) {
        break;
      }
      this.position++;
    }

    const content = lines.join("\n");

    // Determine property type
    let propertyType = "object";
    if (content.includes("rdf:type owl:DatatypeProperty")) {
      propertyType = "data";
    } else if (content.includes("rdf:type owl:AnnotationProperty")) {
      propertyType = "annotation";
    }

    // Extract IRI from first line
    const iriMatch = content.match(/(\w+):(\w+)\s+rdf:type/);
    if (!iriMatch) return null;

    const prefix = this.prefixes[iriMatch[1] || ""] || "";
    const localName = iriMatch[2] || "";
    const iri = `${prefix}${localName}`;

    // Extract label
    const labelMatch = content.match(/rdfs:label\s+"([^"]+)"/);
    const label = labelMatch ? labelMatch[1] : localName;

    // Extract comment/description
    const commentMatch = content.match(/rdfs:comment\s+"([^"]+)"/);
    const description = commentMatch ? commentMatch[1] : undefined;

    // Extract domain
    let domain: string | undefined;
    const domainMatch = content.match(/rdfs:domain\s+(\w+):(\w+)/);
    if (domainMatch && domainMatch[1] && domainMatch[2]) {
      const dPrefix = this.prefixes[domainMatch[1]] || "";
      domain = `${dPrefix}${domainMatch[2]}`;
    }

    // Extract range
    let range: string | undefined;
    const rangeMatch = content.match(/rdfs:range\s+(\w+):(\w+)/);
    if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
      const rPrefix = this.prefixes[rangeMatch[1]] || "";
      range = `${rPrefix}${rangeMatch[2]}`;
    }

    // Extract super properties
    const superProperties: string[] = [];
    const superPropMatch = content.match(/rdfs:subPropertyOf\s+([^;]+)/);
    if (superPropMatch && superPropMatch[1]) {
      const superPropContent = superPropMatch[1];
      const propMatches = superPropContent.matchAll(/(\w+):(\w+)/g);
      for (const match of propMatches) {
        const spPrefix = this.prefixes[match[1] || ""] || "";
        superProperties.push(`${spPrefix}${match[2] || ""}`);
      }
    }

    // Extract annotations
    const annotations: Record<string, string> = {};
    const annotationMatches = content.matchAll(/(\w+):(\w+)\s+"([^"]+)"/g);
    for (const match of annotationMatches) {
      // Skip standard RDF/OWL properties
      if (match[1] && ["rdf", "rdfs", "owl"].includes(match[1])) continue;
      if (match[2] && match[3]) {
        annotations[match[2]] = match[3];
      }
    }

    return {
      iri,
      label,
      description,
      property_type: propertyType as "object" | "data" | "annotation",
      domain,
      range,
      super_properties: superProperties,
      sub_properties: [],
      annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
    };
  }
}

export function parseOwlTurtle(content: string): ParsedOntology {
  const parser = new OwlParser(content);
  return parser.parse();
}
