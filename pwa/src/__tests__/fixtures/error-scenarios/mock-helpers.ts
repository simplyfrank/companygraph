// Mock Helpers for Error Scenario Tests
// Centralized mock functions for common error scenarios

import { vi } from "vitest";

// Network Error Mocks
export function mockNetworkFailure(endpoint: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(endpoint)) {
      throw new Error("Failed to fetch");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockTimeout(endpoint: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(endpoint)) {
      await new Promise(resolve => setTimeout(resolve, 6000));
      throw new Error("Request timeout");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockConnectionReset(endpoint: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(endpoint)) {
      throw new Error("ECONNRESET");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockDNSFailure(endpoint: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(endpoint)) {
      throw new Error("ENOTFOUND");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockGatewayTimeout(endpoint: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(endpoint)) {
      return new Response(JSON.stringify({ error: { code: "gateway_timeout", message: "Gateway timeout" } }), { status: 504 });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockNeo4jUnreachable() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "neo4j_unreachable", message: "Neo4j connection down" } }),
      { status: 503 }
    );
  });
}

export function mockNetworkPartition() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("ECONNREFUSED");
  });
}

// Data Error Mocks
export function mock404Response(endpoint: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Resource not found" } }),
        { status: 404 }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockMalformedResponse(endpoint: string, data: any) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(endpoint)) {
      return new Response(JSON.stringify(data), { status: 200 });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockEmptyResponse(endpoint: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(endpoint)) {
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockDivisionByZero(endpoint: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: { code: "calculation_error", message: "Division by zero" } }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

// Validation Error Mocks
export function mockInvalidIdFormat() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "Invalid ID format" } }),
      { status: 400 }
    );
  });
}

export function mockEmptyId() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "ID is required" } }),
      { status: 400 }
    );
  });
}

export function mockEmptyName() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "Name is required" } }),
      { status: 400 }
    );
  });
}

export function mockEmptyDescription() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "Description is required" } }),
      { status: 400 }
    );
  });
}

export function mockDuplicateLabelName() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "id_conflict", message: "Label name already exists" } }),
      { status: 409 }
    );
  });
}

export function mockInvalidJsonSchema() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "Invalid JSON schema" } }),
      { status: 400 }
    );
  });
}

export function mockInvalidPayload() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "Invalid request payload" } }),
      { status: 400 }
    );
  });
}

export function mockIdConflict() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "id_conflict", message: "ID already exists" } }),
      { status: 409 }
    );
  });
}

export function mockHasEdges() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "has_edges", message: "Node has attached edges" } }),
      { status: 409 }
    );
  });
}

export function mockHasEdgesConstraint() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "has_edges", message: "Cannot delete node with attached edges. Use ?cascade=true" } }),
      { status: 409 }
    );
  });
}

export function mockServiceUnavailable() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "neo4j_unreachable", message: "Service unavailable" } }),
      { status: 503 }
    );
  });
}

// State Error Mocks
export function mockCircularPrecedes(journeyId: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const u = String(url);
    if (u.includes("/query/cypher") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { statement: string };
      if (body.statement.includes("PRECEDES")) {
        // Return circular PRECEDES relationships
        return new Response(
          JSON.stringify({
            rows: [
              { aId: "activity-1", nextIds: ["activity-2"] },
              { aId: "activity-2", nextIds: ["activity-3"] },
              { aId: "activity-3", nextIds: ["activity-1"] }, // Cycle
            ]
          }),
          { status: 200 }
        );
      }
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockLargeJourney(journeyId: string, activityCount: number) {
  const activities = Array.from({ length: activityCount }, (_, i) => ({
    id: `activity-${i}`,
    name: `Activity ${i}`,
    description: `Description ${i}`,
  }));

  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(`/query/getJourney/${journeyId}`)) {
      return new Response(
        JSON.stringify({
          rows: [{
            id: journeyId,
            name: "Large Journey",
            description: "A journey with many activities",
            activities,
          }]
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockQueryTimeout() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "query_timeout", message: "Query exceeded 5s timeout" } }),
      { status: 400 }
    );
  });
}

export function mockResultTruncated() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "result_truncated", message: "Result exceeded 1000 row cap" } }),
      { status: 400 }
    );
  });
}

export function mockDepthExceeded() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "depth_exceeded", message: "Max depth is 8" } }),
      { status: 400 }
    );
  });
}

export function mockDepthOverflow() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "depth_exceeded", message: "Depth parameter exceeds maximum" } }),
      { status: 400 }
    );
  });
}

export function mockDepthUnderflow() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "depth_exceeded", message: "Depth parameter below minimum" } }),
      { status: 400 }
    );
  });
}

export function mockInvalidNodeId() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "Invalid node ID format" } }),
      { status: 400 }
    );
  });
}

export function mockNoPathFound() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ rows: [] }),
      { status: 200 }
    );
  });
}

export function mockEmptyMessage() {
  // Client-side validation, no mock needed
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockWhitespaceMessage() {
  // Client-side validation, no mock needed
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockInvalidRoleId() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "Invalid role ID" } }),
      { status: 400 }
    );
  });
}

export function mockProgressPollingFailure(messageId: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes(`/chat/messages/${messageId}/progress`)) {
      throw new Error("Progress polling failed");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockInvalidJson() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "Invalid JSON format" } }),
      { status: 400 }
    );
  });
}

export function mockEmptyDomain() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "Domain is required" } }),
      { status: 400 }
    );
  });
}

export function mockRequiredFieldValidation() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "Required field is missing" } }),
      { status: 400 }
    );
  });
}

export function mockJsonSchemaValidation() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "JSON schema validation failed" } }),
      { status: 400 }
    );
  });
}

export function mockHookOrderViolation() {
  // This is a React error, not a network error
  // The test framework will catch this
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

export function mockComponentUnmount() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

// Cleanup function
export function restoreAllMocks() {
  vi.restoreAllMocks();
}