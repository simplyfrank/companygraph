// Scenario Parser - Parses error scenario catalog into structured data
import type { ErrorScenario } from "./error-scenario-catalog";

export interface AgentConfig {
  errorScenarioCatalog: string;
  outputDirectory: string;
  fixtureDirectory: string;
  coverageThreshold: number;
  testFramework: "vitest";
  existingTestPatterns: boolean;
}

export interface ParsedScenario extends ErrorScenario {
  testFileName: string;
  testPath: string;
  mockSetupRequired: boolean;
}

export interface ParsedScenarios {
  bySurface: Record<string, ParsedScenario[]>;
  byTab: Record<string, Record<string, ParsedScenario[]>>;
  byCategory: Record<string, Record<string, Record<string, ParsedScenario[]>>>;
  all: ParsedScenario[];
}

export class ScenarioParser {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  parseCatalog(scenarios: ErrorScenario[]): ParsedScenarios {
    const parsed: ParsedScenarios = {
      bySurface: {},
      byTab: {},
      byCategory: {},
      all: [],
    };

    scenarios.forEach(scenario => {
      const parsedScenario: ParsedScenario = {
        ...scenario,
        testFileName: this.generateTestFileName(scenario),
        testPath: this.generateTestPath(scenario),
        mockSetupRequired: this.requiresMockSetup(scenario),
      };

      parsed.all.push(parsedScenario);

      // Organize by surface
      if (!parsed.bySurface[scenario.surface]) {
        parsed.bySurface[scenario.surface] = [];
      }
      parsed.bySurface[scenario.surface].push(parsedScenario);

      // Organize by surface/tab
      if (!parsed.byTab[scenario.surface]) {
        parsed.byTab[scenario.surface] = {};
      }
      if (!parsed.byTab[scenario.surface][scenario.tab]) {
        parsed.byTab[scenario.surface][scenario.tab] = [];
      }
      parsed.byTab[scenario.surface][scenario.tab].push(parsedScenario);

      // Organize by surface/tab/category
      if (!parsed.byCategory[scenario.surface]) {
        parsed.byCategory[scenario.surface] = {};
      }
      if (!parsed.byCategory[scenario.surface][scenario.tab]) {
        parsed.byCategory[scenario.surface][scenario.tab] = {};
      }
      if (!parsed.byCategory[scenario.surface][scenario.tab][scenario.errorCategory]) {
        parsed.byCategory[scenario.surface][scenario.tab][scenario.errorCategory] = [];
      }
      parsed.byCategory[scenario.surface][scenario.tab][scenario.errorCategory].push(parsedScenario);
    });

    return parsed;
  }

  private generateTestFileName(scenario: ErrorScenario): string {
    const surface = scenario.surface.toLowerCase().replace(/\s+/g, "-");
    const tab = scenario.tab.toLowerCase().replace(/\s+/g, "-");
    const category = scenario.errorCategory.toLowerCase().replace(/\s+/g, "-");
    const errorType = scenario.errorType.toLowerCase().replace(/\s+/g, "-");
    return `${surface}-${tab}-${category}-${errorType}.test.tsx`;
  }

  private generateTestPath(scenario: ErrorScenario): string {
    const surface = scenario.surface.toLowerCase().replace(/\s+/g, "-");
    const tab = scenario.tab.toLowerCase().replace(/\s+/g, "-");
    const category = scenario.errorCategory.toLowerCase().replace(/\s+/g, "-");
    return `${surface}/${tab}/${category}`;
  }

  private requiresMockSetup(scenario: ErrorScenario): boolean {
    // Scenarios with network or data errors typically require mock setup
    return ["network", "data"].includes(scenario.errorCategory);
  }

  getScenariosBySurface(surface: string, parsed: ParsedScenarios): ParsedScenario[] {
    return parsed.bySurface[surface] || [];
  }

  getScenariosByTab(surface: string, tab: string, parsed: ParsedScenarios): ParsedScenario[] {
    return parsed.byTab[surface]?.[tab] || [];
  }

  getScenariosByCategory(surface: string, tab: string, category: string, parsed: ParsedScenarios): ParsedScenario[] {
    return parsed.byCategory[surface]?.[tab]?.[category] || [];
  }
}