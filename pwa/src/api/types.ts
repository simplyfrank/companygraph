// Type definitions for API modules

export interface OntologyLabelRow {
  name: string;
  description: string;
  usage_example: string;
  json_schema_doc: Record<string, unknown>;
  external_alignment: Array<{ source: string; id: string }>;
  deprecated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OntologyLabelCreate {
  name: string;
  description: string;
  usage_example: string;
  json_schema_doc: Record<string, unknown>;
  external_alignment?: Array<{ source: string; id: string }>;
}

export interface OntologyLabelUpdate {
  description?: string;
  usage_example?: string;
  json_schema_doc?: Record<string, unknown>;
  external_alignment?: Array<{ source: string; id: string }>;
  deprecated_at?: string | null;
}

export interface OntologyEdgeTypeRow {
  name: string;
  description: string;
  usage_example: string;
  endpoints: Array<{ fromLabel: string; toLabel: string }>;
  external_alignment?: Array<{ source: string; id: string }>;
  deprecated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OntologyEdgeTypeCreate {
  name: string;
  description: string;
  usage_example: string;
  endpoints: Array<{ fromLabel: string; toLabel: string }>;
  external_alignment?: Array<{ source: string; id: string }>;
}

export interface OntologyEdgeTypeUpdate {
  description?: string;
  usage_example?: string;
  endpoints?: Array<{ fromLabel: string; toLabel: string }>;
  external_alignment?: Array<{ source: string; id: string }>;
  deprecated_at?: string | null;
}

export interface BoundedContextRow {
  id: string;
  name: string;
  description: string;
  domain: string;
  subdomain: string;
  type: string;
  oracle_system?: string;
  jira_projects: string[];
  entity_count: number;
  entities: string[];
  relationships: Array<{ type: string; target: string }>;
  shared_domains: string[];
  namespaces: string[];
}

export interface SharedDomainRow {
  id: string;
  name: string;
  description: string;
  tags: string[];
  bounded_contexts: string[];
}

export interface NamespaceRow {
  id: string;
  name: string;
  description: string;
  model_id: string;
  model_name?: string | null;
  bounded_contexts: string[];
}
