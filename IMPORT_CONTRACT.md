# Ontology Import Contract

## Overview

The ontology import/export contract provides a bidirectional, schema-validated API for managing the complete domain model including node labels, edge types, bounded contexts, entities, and their relationships.

**Import Endpoint:** `POST /api/v1/ontology/import`  
**Export Endpoint:** `GET /api/v1/ontology/export?format=json|yaml`

## Contract Schema

The import/export payload follows this structure:

```typescript
{
  nodeLabels?: NodeLabelCreate[],
  edgeTypes?: EdgeTypeCreate[],
  boundedContexts?: BoundedContextCreate[],
  entities?: EntityCreate[],
  boundedContextRelationships?: BoundedContextRelationship[]
}
```

### Node Labels

```typescript
{
  name: string;              // Sanitized: PascalCase, alphanumeric + underscores
  description: string;
  usage_example: string;
  json_schema_doc?: object;  // JSON Schema for node properties
  external_alignment?: ExternalAlignment[];
}
```

### Edge Types

```typescript
{
  name: string;              // Sanitized: PascalCase, alphanumeric + underscores
  description: string;
  usage_example: string;
  endpoints: {
    fromLabel: string;       // Sanitized node label name
    toLabel: string;         // Sanitized node label name
    cardinality: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY";
  }[];
  external_alignment?: ExternalAlignment[];
}
```

### Bounded Contexts

```typescript
{
  id: string;                // UUID
  name: string;              // Bounded context name (e.g., "BC1 Product Catalogue")
  description: string;
  domain: string;            // Domain name (e.g., "Commercial")
  subdomain: string;         // Subdomain identifier (e.g., "3.A")
  type: "Core" | "Generic" | "Supporting";
  oracle_system?: string;    // Oracle system name/version
  jira_projects?: string[];  // Associated Jira project keys
}
```

### Entities

```typescript
{
  id: string;                // UUID
  name: string;              // Entity name (e.g., "Item", "Supplier")
  description: string;
  subdomain: string;         // Subdomain identifier (e.g., "3.A")
  bounded_context: string;   // Bounded context name (e.g., "BC1 Product Catalogue")
  entity_number: number;     // Sequential entity number within domain
  status: "ACTIVE" | "NOT MAINTAINED" | "NOT IN USE" | "PARTIAL" | "UNDER REVIEW";
  oracle_table?: string;     // Oracle table name
  note?: string;             // Additional notes
}
```

### Bounded Context Relationships

```typescript
{
  from: string;              // Source bounded context name
  to: string;                // Target bounded context name
  type: "UPSTREAM_OF" | "DOWNSTREAM_OF";
}
```

## Import Process

The import executes in five ordered passes:

1. **Pass 1 — Node Labels**: Creates/updates node label registry entries with sanitized names
2. **Pass 2 — Edge Types**: Creates/updates edge type registry entries with sanitized endpoint labels
3. **Pass 3 — Bounded Contexts**: Creates/updates BoundedContext nodes with domain attributes
4. **Pass 4 — Entities**: Creates/updates Entity nodes with attributes and PART_OF relationships
5. **Pass 5 — BC Relationships**: Creates UPSTREAM_OF/DOWNSTREAM_OF relationships between bounded contexts

### Response

```typescript
{
  accepted: {
    nodeLabels: number;
    edgeTypes: number;
    boundedContexts: number;
    entities: number;
    boundedContextRelationships: number;
  };
  errors?: {
    section: "nodeLabels" | "edgeTypes" | "boundedContexts" | "entities" | "boundedContextRelationships";
    index: number;
    code: string;
    message: string;
    details?: object;
  }[];
}
```

## Export Process

The export fetches all ontology data in a single request:

- **Node Labels**: From schema cache (includes JSON Schema and external alignments)
- **Edge Types**: From schema cache (includes endpoints and external alignments)
- **Bounded Contexts**: From Neo4j BoundedContext nodes with all attributes
- **Entities**: From Neo4j Entity nodes with all attributes
- **BC Relationships**: From Neo4j bounded context relationship edges

## Contract Guarantees

### Idempotency
- MERGE operations ensure repeated imports don't create duplicates
- Existing nodes/relationships are updated if they already exist

### Name Sanitization
- Node label names are automatically sanitized to match Neo4j rules: `^[A-Z][A-Za-z0-9_]*$`
- Spaces and special characters are replaced with underscores
- Names are converted to PascalCase

### Validation
- All payloads are validated against Zod schemas before processing
- Invalid payloads return 400 with detailed validation errors
- Partial imports (some errors) return 200 with errors array

### Cache Invalidation
- Single `ontologyEvents.emit("ontology.changed")` fires after successful import
- All caches (schema, bounded contexts) are invalidated together

## Example Usage

### Export Current State

```bash
# JSON export
curl http://127.0.0.1:8787/api/v1/ontology/export > ontology-export.json

# YAML export
curl "http://127.0.0.1:8787/api/v1/ontology/export?format=yaml" > ontology-export.yaml
```

### Import from File

```bash
# Using seed script
bun run scripts/seed.ts shared/seed/commercial-domain-import.json

# Direct API call
curl -X POST http://127.0.0.1:8787/api/v1/ontology/import \
  -H "Content-Type: application/json" \
  -d @ontology-export.json
```

### Round-Trip Pattern

```bash
# Export from production
curl http://prod.example.com/api/v1/ontology/export > prod-ontology.json

# Import to staging
curl -X POST http://staging.example.com/api/v1/ontology/import \
  -H "Content-Type: application/json" \
  -d @prod-ontology.json
```

## Sample Payload

See `shared/seed/commercial-domain-import.json` for a complete example including:
- 8 node labels with JSON Schema definitions
- 3 edge types (PART_OF, UPSTREAM_OF, DOWNSTREAM_OF)
- 8 bounded contexts with domain/subdomain/type attributes
- 8 entities with full parameterization
- 15 bounded context relationships showing realistic integration flow

## Best Practices

1. **Version Control**: Store import payloads in git as source of truth
2. **Incremental Updates**: Include only changed sections in import payload
3. **Validation**: Always validate exported data before re-importing
4. **Backup**: Export before major changes to enable rollback
5. **Documentation**: Include `_comment` field in JSON payloads for context
