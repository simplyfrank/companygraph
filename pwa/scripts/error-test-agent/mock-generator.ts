// Mock Generator - Generates mock fixtures for error scenarios
import type { ParsedScenario, AgentConfig } from "./scenario-parser";

export interface MockFixture {
  scenarioId: string;
  mockCode: string;
  mockType: "network" | "data" | "validation" | "state";
}

export class MockGenerator {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async generateFixtures(scenarios: ParsedScenario[]): Promise<MockFixture[]> {
    const fixtures: MockFixture[] = [];

    for (const scenario of scenarios) {
      if (scenario.mockSetupRequired) {
        const fixture = this.generateFixture(scenario);
        fixtures.push(fixture);
      }
    }

    return fixtures;
  }

  private generateFixture(scenario: ParsedScenario): MockFixture {
    const mockType = this.getMockType(scenario);
    const mockCode = this.generateMockCode(scenario);

    return {
      scenarioId: scenario.id,
      mockCode,
      mockType,
    };
  }

  private getMockType(scenario: ParsedScenario): "network" | "data" | "validation" | "state" {
    if (scenario.errorCategory === "network") return "network";
    if (scenario.errorCategory === "data") return "data";
    if (scenario.errorCategory === "validation") return "validation";
    return "state";
  }

  private generateMockCode(scenario: ParsedScenario): string {
    const mockType = this.getMockType(scenario);

    switch (mockType) {
      case "network":
        return this.generateNetworkMockCode(scenario);
      case "data":
        return this.generateDataMockCode(scenario);
      case "validation":
        return this.generateValidationMockCode(scenario);
      case "state":
        return this.generateStateMockCode(scenario);
      default:
        return this.generateGenericMockCode(scenario);
    }
  }

  private generateNetworkMockCode(scenario: ParsedScenario): string {
    return `// Network error mock for ${scenario.id}
export function mock${this.toCamelCase(scenario.errorType)}(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("${scenario.description}");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}`;
  }

  private generateDataMockCode(scenario: ParsedScenario): string {
    return `// Data error mock for ${scenario.id}
export function mock${this.toCamelCase(scenario.errorType)}(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: { code: "${scenario.errorType}", message: "${scenario.description}" } }),
        { status: ${this.getHttpStatusCode(scenario)} }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}`;
  }

  private generateValidationMockCode(scenario: ParsedScenario): string {
    return `// Validation error mock for ${scenario.id}
export function mock${this.toCamelCase(scenario.errorType)}() {
  // Validation errors are typically handled client-side
  // This mock can be used to simulate server-side validation failures
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    return new Response(
      JSON.stringify({ error: { code: "invalid_payload", message: "${scenario.description}" } }),
      { status: 400 }
    );
  });
}`;
  }

  private generateStateMockCode(scenario: ParsedScenario): string {
    return `// State error mock for ${scenario.id}
export function mock${this.toCamelCase(scenario.errorType)}() {
  // State errors are typically handled by React lifecycle
  // This mock can be used to simulate state management issues
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}`;
  }

  private generateGenericMockCode(scenario: ParsedScenario): string {
    return `// Generic error mock for ${scenario.id}
export function mock${this.toCamelCase(scenario.errorType)}() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({ error: { code: "${scenario.errorType}", message: "${scenario.description}" } }),
      { status: 400 }
    );
  });
}`;
  }

  private getHttpStatusCode(scenario: ParsedScenario): number {
    if (scenario.errorType.includes("404")) return 404;
    if (scenario.errorType.includes("409")) return 409;
    if (scenario.errorType.includes("timeout")) return 408;
    if (scenario.errorType.includes("unreachable")) return 503;
    return 400;
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, c => c.toUpperCase());
  }
}