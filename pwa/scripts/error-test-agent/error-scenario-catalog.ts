// Error Scenario Catalog for Test Generation
// This file contains the comprehensive catalog of all error scenarios
// identified across the CompanyGraph application, organized by surface/tab/error type.

export interface ErrorScenario {
  id: string;
  surface: string;
  tab: string;
  errorCategory: string;
  errorType: string;
  description: string;
  inputCombinations: InputCombination[];
  expectedBehavior: string;
  testPriority: "critical" | "high" | "medium" | "low";
}

export interface InputCombination {
  description: string;
  inputs: Record<string, unknown>;
  expectedError: string;
  mockSetup: string;
}

export const ERROR_SCENARIO_CATALOG: ErrorScenario[] = [
  // =====================================================================
  // EXPLORER SURFACE
  // =====================================================================
  
  // DOMAINS TAB
  {
    id: "explorer-domains-network-unreachable",
    surface: "explorer",
    tab: "domains",
    errorCategory: "network",
    errorType: "api_unreachable",
    description: "API unreachable when loading domain list",
    inputCombinations: [
      {
        description: "Server down",
        inputs: {},
        expectedError: "Error: 503 Service Unavailable /api/v1/query/listDomains",
        mockSetup: "mockNetworkFailure('/api/v1/query/listDomains')"
      },
      {
        description: "Network partition",
        inputs: {},
        expectedError: "Error: Failed to fetch",
        mockSetup: "mockFetchFailure('/api/v1/query/listDomains')"
      },
      {
        description: "DNS failure",
        inputs: {},
        expectedError: "Error: Failed to fetch",
        mockSetup: "mockDNSFailure('/api/v1/query/listDomains')"
      }
    ],
    expectedBehavior: "Renders ErrorState with service unavailable message",
    testPriority: "critical"
  },
  {
    id: "explorer-domains-network-timeout",
    surface: "explorer",
    tab: "domains",
    errorCategory: "network",
    errorType: "connection_timeout",
    description: "Connection timeout when loading domain list",
    inputCombinations: [
      {
        description: "Slow network",
        inputs: {},
        expectedError: "Error: 408 Request Timeout /api/v1/query/listDomains",
        mockSetup: "mockTimeout('/api/v1/query/listDomains')"
      },
      {
        description: "Server overload",
        inputs: {},
        expectedError: "Error: 504 Gateway Timeout",
        mockSetup: "mockGatewayTimeout('/api/v1/query/listDomains')"
      }
    ],
    expectedBehavior: "Renders ErrorState with timeout message",
    testPriority: "high"
  },
  {
    id: "explorer-domains-data-404",
    surface: "explorer",
    tab: "domains",
    errorCategory: "data",
    errorType: "domain_detail_404",
    description: "Domain detail 404 when accessing invalid domain ID",
    inputCombinations: [
      {
        description: "Invalid domain ID from URL",
        inputs: { entityId: "invalid-domain-id" },
        expectedError: "404 not_found",
        mockSetup: "mock404Response('/api/v1/nodes/Domain/invalid-domain-id')"
      },
      {
        description: "Non-existent domain ID",
        inputs: { entityId: "0189abcd-1234-5678-90ab-cdef01234567" },
        expectedError: "404 not_found",
        mockSetup: "mock404Response('/api/v1/nodes/Domain/0189abcd-1234-5678-90ab-cdef01234567')"
      }
    ],
    expectedBehavior: "Renders NotFoundPanel with back to domains link",
    testPriority: "critical"
  },
  {
    id: "explorer-domains-data-malformed",
    surface: "explorer",
    tab: "domains",
    errorCategory: "data",
    errorType: "malformed_domain_data",
    description: "Malformed domain data in API response",
    inputCombinations: [
      {
        description: "Missing required fields",
        inputs: {},
        expectedError: "Error: Invalid response structure",
        mockSetup: "mockMalformedResponse('/api/v1/query/listDomains', { rows: [{ id: 'd-1' }] })"
      },
      {
        description: "Empty result set",
        inputs: {},
        expectedError: "No domains found",
        mockSetup: "mockEmptyResponse('/api/v1/query/listDomains')"
      },
      {
        description: "Corrupted journey counts",
        inputs: {},
        expectedError: "Error: Invalid count values",
        mockSetup: "mockMalformedResponse('/api/v1/query/listDomains', { rows: [{ id: 'd-1', name: 'Test', journeys: 'invalid' }] })"
      }
    ],
    expectedBehavior: "Renders ErrorState or empty state appropriately",
    testPriority: "high"
  },
  {
    id: "explorer-domains-validation-invalid-id",
    surface: "explorer",
    tab: "domains",
    errorCategory: "validation",
    errorType: "invalid_domain_id",
    description: "Invalid domain ID format validation",
    inputCombinations: [
      {
        description: "Non-UUIDv7 format",
        inputs: { entityId: "not-a-uuid" },
        expectedError: "Invalid ID format",
        mockSetup: "mockInvalidIdFormat()"
      },
      {
        description: "Empty domain ID",
        inputs: { entityId: "" },
        expectedError: "ID is required",
        mockSetup: "mockEmptyId()"
      }
    ],
    expectedBehavior: "Shows validation error or redirects to default",
    testPriority: "high"
  },

  // JOURNEY DETAIL TAB
  {
    id: "explorer-journey-detail-network-unreachable",
    surface: "explorer",
    tab: "journey-detail",
    errorCategory: "network",
    errorType: "journey_fetch_failure",
    description: "Journey data fetch failure",
    inputCombinations: [
      {
        description: "Network timeout during getJourney",
        inputs: { journeyId: "journey-1" },
        expectedError: "Error: Failed to fetch /api/v1/query/getJourney/journey-1",
        mockSetup: "mockNetworkFailure('/api/v1/query/getJourney/journey-1')"
      },
      {
        description: "Connection reset",
        inputs: { journeyId: "journey-1" },
        expectedError: "Error: Failed to fetch",
        mockSetup: "mockConnectionReset('/api/v1/query/getJourney/journey-1')"
      }
    ],
    expectedBehavior: "Renders ErrorState with fetch failure message",
    testPriority: "critical"
  },
  {
    id: "explorer-journey-detail-data-404",
    surface: "explorer",
    tab: "journey-detail",
    errorCategory: "data",
    errorType: "journey_404",
    description: "Journey 404 when accessing invalid journey ID",
    inputCombinations: [
      {
        description: "Invalid journey ID",
        inputs: { journeyId: "invalid-journey-id" },
        expectedError: "404 not_found",
        mockSetup: "mock404Response('/api/v1/query/getJourney/invalid-journey-id')"
      },
      {
        description: "Non-existent journey ID",
        inputs: { journeyId: "0189abcd-1234-5678-90ab-cdef01234567" },
        expectedError: "404 not_found",
        mockSetup: "mock404Response('/api/v1/query/getJourney/0189abcd-1234-5678-90ab-cdef01234567')"
      }
    ],
    expectedBehavior: "Renders NotFoundPanel with back to domains link",
    testPriority: "critical"
  },
  {
    id: "explorer-journey-detail-data-activity-404",
    surface: "explorer",
    tab: "journey-detail",
    errorCategory: "data",
    errorType: "activity_404",
    description: "Activity 404 when accessing invalid activity ID",
    inputCombinations: [
      {
        description: "Invalid activity ID",
        inputs: { journeyId: "journey-1", activityId: "invalid-activity-id" },
        expectedError: "404 not_found",
        mockSetup: "mock404Response('/api/v1/query/getActivity/invalid-activity-id')"
      }
    ],
    expectedBehavior: "Renders NotFoundPanel or shows error in activity list",
    testPriority: "high"
  },
  {
    id: "explorer-journey-detail-validation-invalid-id",
    surface: "explorer",
    tab: "journey-detail",
    errorCategory: "validation",
    errorType: "invalid_journey_id",
    description: "Invalid journey ID format validation",
    inputCombinations: [
      {
        description: "Non-UUIDv7 format",
        inputs: { journeyId: "not-a-uuid" },
        expectedError: "Invalid ID format",
        mockSetup: "mockInvalidIdFormat()"
      },
      {
        description: "Empty journey ID",
        inputs: { journeyId: "" },
        expectedError: "Journey ID is required",
        mockSetup: "mockEmptyId()"
      }
    ],
    expectedBehavior: "Shows validation error or redirects to journey picker",
    testPriority: "high"
  },
  {
    id: "explorer-journey-detail-state-cycle-detection",
    surface: "explorer",
    tab: "journey-detail",
    errorCategory: "state",
    errorType: "precedes_cycle",
    description: "Circular PRECEDES relationships causing cycle detection",
    inputCombinations: [
      {
        description: "Activities with circular dependencies",
        inputs: { journeyId: "journey-with-cycle" },
        expectedError: "Cycle detected in activity order",
        mockSetup: "mockCircularPrecedes('journey-with-cycle')"
      }
    ],
    expectedBehavior: "Shows cycle warning ribbon and falls back to createdAt ordering",
    testPriority: "medium"
  },

  // JOURNEY GRAPH TAB
  {
    id: "explorer-journey-graph-network-unreachable",
    surface: "explorer",
    tab: "journey-graph",
    errorCategory: "network",
    errorType: "multi-journey-load-failure",
    description: "Multi-journey data loading failure",
    inputCombinations: [
      {
        description: "Network timeout during multi-journey load",
        inputs: { layoutMode: "multi" },
        expectedError: "Error: Failed to fetch multi-journey data",
        mockSetup: "mockNetworkFailure('/api/v1/query/cypher')"
      }
    ],
    expectedBehavior: "Renders ErrorState for multi-journey view",
    testPriority: "critical"
  },
  {
    id: "explorer-journey-graph-validation-depth-overflow",
    surface: "explorer",
    tab: "journey-graph",
    errorCategory: "validation",
    errorType: "depth_parameter_overflow",
    description: "Depth parameter overflow (>8 levels)",
    inputCombinations: [
      {
        description: "Depth parameter >8",
        inputs: { depth: 9 },
        expectedError: "Max depth is 8",
        mockSetup: "mockDepthOverflow()"
      },
      {
        description: "Depth parameter = 0",
        inputs: { depth: 0 },
        expectedError: "Min depth is 1",
        mockSetup: "mockDepthUnderflow()"
      }
    ],
    expectedBehavior: "Shows depth validation error without API call",
    testPriority: "high"
  },
  {
    id: "explorer-journey-graph-data-canvas-performance",
    surface: "explorer",
    tab: "journey-graph",
    errorCategory: "data",
    errorType: "canvas_performance_issue",
    description: "Canvas rendering performance issues with large datasets",
    inputCombinations: [
      {
        description: "Journey with 500+ activities",
        inputs: { journeyId: "large-journey" },
        expectedError: "Canvas rendering timeout",
        mockSetup: "mockLargeJourney('large-journey', 500)"
      }
    ],
    expectedBehavior: "Shows loading state or performance warning",
    testPriority: "medium"
  },

  // PATH FINDER TAB
  {
    id: "explorer-path-finder-network-timeout",
    surface: "explorer",
    tab: "path-finder",
    errorCategory: "network",
    errorType: "path_query_timeout",
    description: "Path query timeout (5s)",
    inputCombinations: [
      {
        description: "Complex graph traversal timeout",
        inputs: { fromId: "node-a", toId: "node-b", depth: 8 },
        expectedError: "query_timeout",
        mockSetup: "mockQueryTimeout('/api/v1/query/findPath')"
      }
    ],
    expectedBehavior: "Renders path-timeout banner",
    testPriority: "critical"
  },
  {
    id: "explorer-path-finder-network-unreachable",
    surface: "explorer",
    tab: "path-finder",
    errorCategory: "network",
    errorType: "neo4j_unreachable",
    description: "Neo4j unreachable during path finding",
    inputCombinations: [
      {
        description: "Database connection failure",
        inputs: { fromId: "node-a", toId: "node-b" },
        expectedError: "neo4j_unreachable",
        mockSetup: "mockNeo4jUnreachable()"
      }
    ],
    expectedBehavior: "Renders service-offline banner",
    testPriority: "critical"
  },
  {
    id: "explorer-path-finder-data-no-path",
    surface: "explorer",
    tab: "path-finder",
    errorCategory: "data",
    errorType: "no_path_found",
    description: "No path found within depth",
    inputCombinations: [
      {
        description: "Disconnected graph components",
        inputs: { fromId: "node-a", toId: "node-b", depth: 8 },
        expectedError: "No path within depth 8",
        mockSetup: "mockNoPathFound()"
      }
    ],
    expectedBehavior: "Renders no-path message with depth suggestion",
    testPriority: "high"
  },
  {
    id: "explorer-path-finder-data-result-truncated",
    surface: "explorer",
    tab: "path-finder",
    errorCategory: "data",
    errorType: "result_truncated",
    description: "Result truncated (>1000 paths)",
    inputCombinations: [
      {
        description: "Multiple shortest paths exist",
        inputs: { fromId: "node-a", toId: "node-b" },
        expectedError: "result_truncated",
        mockSetup: "mockResultTruncated()"
      }
    ],
    expectedBehavior: "Renders truncated result banner",
    testPriority: "medium"
  },
  {
    id: "explorer-path-finder-validation-depth-exceeded",
    surface: "explorer",
    tab: "path-finder",
    errorCategory: "validation",
    errorType: "depth_exceeded",
    description: "Depth exceeded (>8)",
    inputCombinations: [
      {
        description: "Direct URL with depth=9",
        inputs: { depth: 9 },
        expectedError: "Max depth is 8",
        mockSetup: "mockDepthExceeded()"
      },
      {
        description: "Invalid node IDs",
        inputs: { fromId: "invalid", toId: "invalid" },
        expectedError: "Invalid node ID format",
        mockSetup: "mockInvalidNodeId()"
      }
    ],
    expectedBehavior: "Shows depth validation error without API call",
    testPriority: "high"
  },

  // =====================================================================
  // CHAT SURFACE
  // =====================================================================
  
  // THREAD TAB
  {
    id: "chat-thread-network-send-failure",
    surface: "chat",
    tab: "thread",
    errorCategory: "network",
    errorType: "message_send_failure",
    description: "Chat message send failure",
    inputCombinations: [
      {
        description: "Network timeout during message send",
        inputs: { message: "Test message" },
        expectedError: "Error: Failed to send message",
        mockSetup: "mockNetworkFailure('/api/v1/chat/messages')"
      }
    ],
    expectedBehavior: "Shows error banner and keeps message in input",
    testPriority: "critical"
  },
  {
    id: "chat-thread-network-progress-failure",
    surface: "chat",
    tab: "thread",
    errorCategory: "network",
    errorType: "progress_polling_failure",
    description: "Progress polling failure during streaming",
    inputCombinations: [
      {
        description: "SSE connection drop",
        inputs: { messageId: "msg-1" },
        expectedError: "Error: Progress polling failed",
        mockSetup: "mockProgressPollingFailure('/api/v1/chat/messages/msg-1/progress')"
      }
    ],
    expectedBehavior: "Shows streaming interruption error",
    testPriority: "high"
  },
  {
    id: "chat-thread-validation-empty-message",
    surface: "chat",
    tab: "thread",
    errorCategory: "validation",
    errorType: "empty_message",
    description: "Empty message validation",
    inputCombinations: [
      {
        description: "Empty string",
        inputs: { message: "" },
        expectedError: "Message cannot be empty",
        mockSetup: "mockEmptyMessage()"
      },
      {
        description: "Only whitespace",
        inputs: { message: "   " },
        expectedError: "Message cannot be empty",
        mockSetup: "mockWhitespaceMessage()"
      }
    ],
    expectedBehavior: "Disables send button and shows validation error",
    testPriority: "high"
  },
  {
    id: "chat-thread-validation-invalid-role",
    surface: "chat",
    tab: "thread",
    errorCategory: "validation",
    errorType: "invalid_role_id",
    description: "Invalid role ID in /role command",
    inputCombinations: [
      {
        description: "Non-existent role ID",
        inputs: { message: "/role invalid_role_id test" },
        expectedError: "Invalid role ID",
        mockSetup: "mockInvalidRoleId()"
      }
    ],
    expectedBehavior: "Shows role validation error",
    testPriority: "medium"
  },

  // =====================================================================
  // ONTOLOGY SURFACE
  // =====================================================================
  
  // CATALOG TAB
  {
    id: "ontology-catalog-network-load-failure",
    surface: "ontology",
    tab: "catalog",
    errorCategory: "network",
    errorType: "label_list_failure",
    description: "Label list loading failure",
    inputCombinations: [
      {
        description: "Network timeout during label list fetch",
        inputs: {},
        expectedError: "Error: Failed to fetch labels",
        mockSetup: "mockNetworkFailure('/api/v1/ontology/node-labels')"
      }
    ],
    expectedBehavior: "Renders ErrorState for label list",
    testPriority: "critical"
  },
  {
    id: "ontology-catalog-validation-duplicate-name",
    surface: "ontology",
    tab: "catalog",
    errorCategory: "validation",
    errorType: "duplicate_label_name",
    description: "Duplicate label name validation",
    inputCombinations: [
      {
        description: "Creating existing label name",
        inputs: { name: "Domain", description: "Test", usageExample: "Test" },
        expectedError: "id_conflict",
        mockSetup: "mockDuplicateLabelName()"
      }
    ],
    expectedBehavior: "Shows conflict error on label creation",
    testPriority: "high"
  },
  {
    id: "ontology-catalog-validation-invalid-schema",
    surface: "ontology",
    tab: "catalog",
    errorCategory: "validation",
    errorType: "invalid_json_schema",
    description: "Invalid JSON schema validation",
    inputCombinations: [
      {
        description: "Malformed JSON schema",
        inputs: { jsonSchema: "{ invalid json }" },
        expectedError: "invalid_payload",
        mockSetup: "mockInvalidJsonSchema()"
      }
    ],
    expectedBehavior: "Shows schema validation error",
    testPriority: "high"
  },

  // ERD TAB
  {
    id: "ontology-erd-network-graph-failure",
    surface: "ontology",
    tab: "erd",
    errorCategory: "network",
    errorType: "graph_data_failure",
    description: "Graph data loading failure",
    inputCombinations: [
      {
        description: "Network timeout during graph load",
        inputs: {},
        expectedError: "Error: Failed to load graph data",
        mockSetup: "mockNetworkFailure('/api/v1/query/cypher')"
      }
    ],
    expectedBehavior: "Renders ErrorState for graph canvas",
    testPriority: "critical"
  },
  {
    id: "ontology-erd-data-entity-delete-failure",
    surface: "ontology",
    tab: "erd",
    errorCategory: "data",
    errorType: "entity_delete_failure",
    description: "Entity deletion failure (has_edges constraint)",
    inputCombinations: [
      {
        description: "Deleting entity with attached edges",
        inputs: { entityId: "entity-1" },
        expectedError: "has_edges",
        mockSetup: "mockHasEdgesConstraint()"
      }
    ],
    expectedBehavior: "Shows constraint error suggesting cascade delete",
    testPriority: "high"
  },

  // EDITOR TAB
  {
    id: "ontology-editor-network-node-failure",
    surface: "ontology",
    tab: "editor",
    errorCategory: "network",
    errorType: "node_detail_failure",
    description: "Node detail loading failure",
    inputCombinations: [
      {
        description: "Network timeout during node detail fetch",
        inputs: { label: "Activity", id: "activity-1" },
        expectedError: "Error: Failed to fetch node detail",
        mockSetup: "mockNetworkFailure('/api/v1/nodes/Activity/activity-1')"
      }
    ],
    expectedBehavior: "Renders ErrorState for node detail",
    testPriority: "critical"
  },
  {
    id: "ontology-editor-validation-required-fields",
    surface: "ontology",
    tab: "editor",
    errorCategory: "validation",
    errorType: "missing_required_fields",
    description: "Missing required field validation",
    inputCombinations: [
      {
        description: "Empty entity name",
        inputs: { name: "", description: "Test" },
        expectedError: "Name is required",
        mockSetup: "mockEmptyName()"
      },
      {
        description: "Empty description",
        inputs: { name: "Test", description: "" },
        expectedError: "Description is required",
        mockSetup: "mockEmptyDescription()"
      }
    ],
    expectedBehavior: "Shows validation error on form submission",
    testPriority: "high"
  },

  // =====================================================================
  // SME SURFACE
  // =====================================================================
  
  // REVIEW TAB
  {
    id: "sme-review-network-data-failure",
    surface: "sme",
    tab: "review",
    errorCategory: "network",
    errorType: "review_data_failure",
    description: "Review data loading failure",
    inputCombinations: [
      {
        description: "Network timeout during review data fetch",
        inputs: { journeyId: "journey-1" },
        expectedError: "Error: Failed to fetch review data",
        mockSetup: "mockNetworkFailure('/api/v1/query/getJourney/journey-1')"
      }
    ],
    expectedBehavior: "Renders ErrorState for review data",
    testPriority: "critical"
  },
  {
    id: "sme-review-data-json-parse-failure",
    surface: "sme",
    tab: "review",
    errorCategory: "data",
    errorType: "json_parse_failure",
    description: "JSON parsing failures in bulk paste",
    inputCombinations: [
      {
        description: "Invalid JSON in bulk paste",
        inputs: { bulkPasteText: "{ invalid json }" },
        expectedError: "Invalid JSON format",
        mockSetup: "mockInvalidJson()"
      }
    ],
    expectedBehavior: "Shows JSON parsing error",
    testPriority: "high"
  },

  // ADD TAB
  {
    id: "sme-add-network-creation-failure",
    surface: "sme",
    tab: "add",
    errorCategory: "network",
    errorType: "journey_creation_failure",
    description: "Journey creation failure",
    inputCombinations: [
      {
        description: "Network timeout during import",
        inputs: { name: "Test Journey", domainId: "domain-1" },
        expectedError: "Error: Failed to create journey",
        mockSetup: "mockNetworkFailure('/api/v1/import')"
      }
    ],
    expectedBehavior: "Shows error banner and keeps form data",
    testPriority: "critical"
  },
  {
    id: "sme-add-validation-required-fields",
    surface: "sme",
    tab: "add",
    errorCategory: "validation",
    errorType: "missing_required_fields",
    description: "Missing required field validation",
    inputCombinations: [
      {
        description: "Empty journey name",
        inputs: { name: "", domainId: "domain-1" },
        expectedError: "Name and domain are required",
        mockSetup: "mockEmptyName()"
      },
      {
        description: "Empty domain ID",
        inputs: { name: "Test Journey", domainId: "" },
        expectedError: "Name and domain are required",
        mockSetup: "mockEmptyDomain()"
      }
    ],
    expectedBehavior: "Shows validation error on form submission",
    testPriority: "high"
  },

  // =====================================================================
  // ANALYTICS SURFACE
  // =====================================================================
  
  // OVERVIEW TAB
  {
    id: "analytics-overview-network-stats-failure",
    surface: "analytics",
    tab: "overview",
    errorCategory: "network",
    errorType: "stats_loading_failure",
    description: "Stats loading failure",
    inputCombinations: [
      {
        description: "Network timeout during stats fetch",
        inputs: {},
        expectedError: "Error: Failed to load stats",
        mockSetup: "mockNetworkFailure('/api/v1/stats')"
      }
    ],
    expectedBehavior: "Renders ErrorState for stats",
    testPriority: "critical"
  },
  {
    id: "analytics-overview-data-calculation-failure",
    surface: "analytics",
    tab: "overview",
    errorCategory: "data",
    errorType: "metrics_calculation_failure",
    description: "Metrics calculation failures",
    inputCombinations: [
      {
        description: "Division by zero in metrics",
        inputs: {},
        expectedError: "Error: Metric calculation failed",
        mockSetup: "mockDivisionByZero()"
      }
    ],
    expectedBehavior: "Shows calculation error or handles gracefully",
    testPriority: "medium"
  },

  // =====================================================================
  // API SURFACE
  // =====================================================================
  
  // IMPORT TAB
  {
    id: "api-import-network-failure",
    surface: "api",
    tab: "import",
    errorCategory: "network",
    errorType: "import_operation_failure",
    description: "Import operation failure",
    inputCombinations: [
      {
        description: "Network timeout during import",
        inputs: { importPayload: { nodes: [], edges: [] } },
        expectedError: "Error: Import failed",
        mockSetup: "mockNetworkFailure('/api/v1/import')"
      }
    ],
    expectedBehavior: "Shows import error with details",
    testPriority: "critical"
  },
  {
    id: "api-import-validation-invalid-payload",
    surface: "api",
    tab: "import",
    errorCategory: "validation",
    errorType: "invalid_import_payload",
    description: "Import payload validation failures",
    inputCombinations: [
      {
        description: "Invalid node structure",
        inputs: { importPayload: { nodes: [{ invalid: "structure" }], edges: [] } },
        expectedError: "invalid_payload",
        mockSetup: "mockInvalidImportPayload()"
      }
    ],
    expectedBehavior: "Shows validation error with field details",
    testPriority: "high"
  },

  // =====================================================================
  // EXEC SURFACE
  // =====================================================================
  
  // KPI MANAGEMENT TAB
  {
    id: "exec-kpi-network-failure",
    surface: "exec",
    tab: "kpi-management",
    errorCategory: "network",
    errorType: "kpi_data_failure",
    description: "KPI data loading failure",
    inputCombinations: [
      {
        description: "Network timeout during KPI fetch",
        inputs: {},
        expectedError: "Error: Failed to load KPI data",
        mockSetup: "mockNetworkFailure('/api/v1/kpis')"
      }
    ],
    expectedBehavior: "Renders ErrorState for KPI data",
    testPriority: "critical"
  },
  {
    id: "exec-kpi-validation-required-fields",
    surface: "exec",
    tab: "kpi-management",
    errorCategory: "validation",
    errorType: "missing_required_fields",
    description: "Missing required field validation",
    inputCombinations: [
      {
        description: "Empty KPI name",
        inputs: { name: "", targetValue: 100, unit: "%" },
        expectedError: "Name is required",
        mockSetup: "mockEmptyName()"
      }
    ],
    expectedBehavior: "Shows validation error on form submission",
    testPriority: "high"
  },

  // OKR MANAGEMENT TAB
  {
    id: "exec-okr-network-failure",
    surface: "exec",
    tab: "okr-management",
    errorCategory: "network",
    errorType: "okr_data_failure",
    description: "OKR data loading failure",
    inputCombinations: [
      {
        description: "Network timeout during OKR fetch",
        inputs: {},
        expectedError: "Error: Failed to load OKR data",
        mockSetup: "mockNetworkFailure('/api/v1/okrs')"
      }
    ],
    expectedBehavior: "Renders ErrorState for OKR data",
    testPriority: "critical"
  },

  // =====================================================================
  // CROSS-CUTTING ERROR SCENARIOS
  // =====================================================================
  
  // NETWORK/CONNECTIVITY
  {
    id: "cross-cutting-network-service-offline",
    surface: "cross-cutting",
    tab: "network-connectivity",
    errorCategory: "network",
    errorType: "service_offline",
    description: "Service offline (Neo4j unreachable)",
    inputCombinations: [
      {
        description: "Neo4j service stopped",
        inputs: {},
        expectedError: "neo4j_unreachable",
        mockSetup: "mockNeo4jUnreachable()"
      },
      {
        description: "Network partition",
        inputs: {},
        expectedError: "Failed to fetch",
        mockSetup: "mockNetworkPartition()"
      }
    ],
    expectedBehavior: "Shows service offline banner across all surfaces",
    testPriority: "critical"
  },
  {
    id: "cross-cutting-network-query-timeout",
    surface: "cross-cutting",
    tab: "network-connectivity",
    errorCategory: "network",
    errorType: "query_timeout",
    description: "Query timeout (5s)",
    inputCombinations: [
      {
        description: "Complex Cypher query timeout",
        inputs: {},
        expectedError: "query_timeout",
        mockSetup: "mockQueryTimeout()"
      }
    ],
    expectedBehavior: "Shows timeout error with retry suggestion",
    testPriority: "high"
  },

  // HTTP ERROR CODES
  {
    id: "cross-cutting-http-400-invalid-payload",
    surface: "cross-cutting",
    tab: "http-error-codes",
    errorCategory: "http",
    errorType: "400_invalid_payload",
    description: "400 Bad Request - Invalid payload",
    inputCombinations: [
      {
        description: "Malformed JSON payload",
        inputs: { payload: "{ invalid }" },
        expectedError: "invalid_payload",
        mockSetup: "mockInvalidPayload()"
      }
    ],
    expectedBehavior: "Shows validation error with field details",
    testPriority: "high"
  },
  {
    id: "cross-cutting-http-404-not-found",
    surface: "cross-cutting",
    tab: "http-error-codes",
    errorCategory: "http",
    errorType: "404_not_found",
    description: "404 Not Found",
    inputCombinations: [
      {
        description: "Non-existent resource",
        inputs: { resourceId: "non-existent" },
        expectedError: "not_found",
        mockSetup: "mock404Response()"
      }
    ],
    expectedBehavior: "Renders NotFoundPanel with back navigation",
    testPriority: "critical"
  },
  {
    id: "cross-cutting-http-409-conflict",
    surface: "cross-cutting",
    tab: "http-error-codes",
    errorCategory: "http",
    errorType: "409_conflict",
    description: "409 Conflict",
    inputCombinations: [
      {
        description: "ID conflict on create",
        inputs: { id: "existing-id" },
        expectedError: "id_conflict",
        mockSetup: "mockIdConflict()"
      },
      {
        description: "Delete with attached edges",
        inputs: { nodeId: "node-with-edges" },
        expectedError: "has_edges",
        mockSetup: "mockHasEdges()"
      }
    ],
    expectedBehavior: "Shows conflict error with resolution suggestion",
    testPriority: "high"
  },
  {
    id: "cross-cutting-http-503-unavailable",
    surface: "cross-cutting",
    tab: "http-error-codes",
    errorCategory: "http",
    errorType: "503_unavailable",
    description: "503 Service Unavailable",
    inputCombinations: [
      {
        description: "Neo4j connection down",
        inputs: {},
        expectedError: "neo4j_unreachable",
        mockSetup: "mockServiceUnavailable()"
      }
    ],
    expectedBehavior: "Shows service unavailable banner",
    testPriority: "critical"
  },

  // DATA VALIDATION
  {
    id: "cross-cutting-validation-required-fields",
    surface: "cross-cutting",
    tab: "data-validation",
    errorCategory: "validation",
    errorType: "required_field_validation",
    description: "Required field validation failures",
    inputCombinations: [
      {
        description: "Empty required string fields",
        inputs: { name: "", description: "" },
        expectedError: "Field is required",
        mockSetup: "mockRequiredFieldValidation()"
      }
    ],
    expectedBehavior: "Shows field-level validation errors",
    testPriority: "high"
  },
  {
    id: "cross-cutting-validation-json-schema",
    surface: "cross-cutting",
    tab: "data-validation",
    errorCategory: "validation",
    errorType: "json_schema_validation",
    description: "JSON schema validation failures",
    inputCombinations: [
      {
        description: "Invalid JSON structure",
        inputs: { schema: "{ invalid }" },
        expectedError: "Invalid JSON schema",
        mockSetup: "mockJsonSchemaValidation()"
      }
    ],
    expectedBehavior: "Shows schema validation error with path",
    testPriority: "high"
  },

  // STATE MANAGEMENT
  {
    id: "cross-cutting-state-hook-order",
    surface: "cross-cutting",
    tab: "state-management",
    errorCategory: "state",
    errorType: "hook_order_violation",
    description: "React hook order violations",
    inputCombinations: [
      {
        description: "Conditional hook calls",
        inputs: { condition: true },
        expectedError: "Rendered fewer hooks than expected",
        mockSetup: "mockHookOrderViolation()"
      }
    ],
    expectedBehavior: "React throws hook order error (test framework catches)",
    testPriority: "medium"
  },
  {
    id: "cross-cutting-state-abort-signal",
    surface: "cross-cutting",
    tab: "state-management",
    errorCategory: "state",
    errorType: "abort_signal_handling",
    description: "Abort signal handling errors",
    inputCombinations: [
      {
        description: "Component unmount during fetch",
        inputs: { unmount: true },
        expectedError: "AbortError",
        mockSetup: "mockComponentUnmount()"
      }
    ],
    expectedBehavior: "Silently swallows AbortError (no error shown)",
    testPriority: "medium"
  },
];

// Helper functions to organize scenarios
export function getScenariosBySurface(surface: string): ErrorScenario[] {
  return ERROR_SCENARIO_CATALOG.filter(s => s.surface === surface);
}

export function getScenariosByTab(surface: string, tab: string): ErrorScenario[] {
  return ERROR_SCENARIO_CATALOG.filter(s => s.surface === surface && s.tab === tab);
}

export function getScenariosByCategory(surface: string, tab: string, category: string): ErrorScenario[] {
  return ERROR_SCENARIO_CATALOG.filter(s => s.surface === surface && s.tab === tab && s.errorCategory === category);
}

export function getCriticalScenarios(): ErrorScenario[] {
  return ERROR_SCENARIO_CATALOG.filter(s => s.testPriority === "critical");
}

export function getTotalScenarioCount(): number {
  return ERROR_SCENARIO_CATALOG.length;
}

export function getScenarioCountBySurface(): Record<string, number> {
  const counts: Record<string, number> = {};
  ERROR_SCENARIO_CATALOG.forEach(s => {
    counts[s.surface] = (counts[s.surface] || 0) + 1;
  });
  return counts;
}