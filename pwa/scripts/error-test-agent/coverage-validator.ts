// Coverage Validator - Validates test coverage against error scenario catalog
import type { ParsedScenario, AgentConfig } from "./scenario-parser";
import type { TestFile } from "./test-builder";

export interface CoverageReport {
  totalScenarios: number;
  testedScenarios: number;
  coveragePercentage: number;
  gaps: CoverageGap[];
  bySurface: Record<string, SurfaceCoverage>;
}

export interface CoverageGap {
  surface: string;
  tab: string;
  scenario: string;
  reason: string;
}

export interface SurfaceCoverage {
  totalScenarios: number;
  testedScenarios: number;
  coveragePercentage: number;
  tabs: Record<string, TabCoverage>;
}

export interface TabCoverage {
  totalScenarios: number;
  testedScenarios: number;
  coveragePercentage: number;
  categories: Record<string, CategoryCoverage>;
}

export interface CategoryCoverage {
  totalScenarios: number;
  testedScenarios: number;
  coveragePercentage: number;
  scenarios: Array<{
    scenario: string;
    tested: boolean;
  }>;
}

export class CoverageValidator {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  validateCoverage(scenarios: ParsedScenario[], testFiles: TestFile[]): CoverageReport {
    const testedScenarioIds = new Set(testFiles.map(tf => tf.scenario.id));
    const gaps: CoverageGap[] = [];
    const bySurface: Record<string, SurfaceCoverage> = {};

    // Calculate overall coverage
    const totalScenarios = scenarios.length;
    const testedScenarios = scenarios.filter(s => testedScenarioIds.has(s.id)).length;
    const coveragePercentage = totalScenarios > 0 ? (testedScenarios / totalScenarios) * 100 : 0;

    // Identify gaps
    scenarios.forEach(scenario => {
      if (!testedScenarioIds.has(scenario.id)) {
        gaps.push({
          surface: scenario.surface,
          tab: scenario.tab,
          scenario: scenario.errorType,
          reason: "No test file generated",
        });
      }
    });

    // Calculate coverage by surface
    const surfaceGroups = this.groupBySurface(scenarios);
    Object.entries(surfaceGroups).forEach(([surface, surfaceScenarios]) => {
      const surfaceTested = surfaceScenarios.filter(s => testedScenarioIds.has(s.id)).length;
      const surfaceCoverage = (surfaceTested / surfaceScenarios.length) * 100;

      const tabs = this.calculateTabCoverage(surfaceScenarios, testedScenarioIds);

      bySurface[surface] = {
        totalScenarios: surfaceScenarios.length,
        testedScenarios: surfaceTested,
        coveragePercentage: surfaceCoverage,
        tabs,
      };
    });

    return {
      totalScenarios,
      testedScenarios,
      coveragePercentage,
      gaps,
      bySurface,
    };
  }

  private groupBySurface(scenarios: ParsedScenario[]): Record<string, ParsedScenario[]> {
    const groups: Record<string, ParsedScenario[]> = {};
    scenarios.forEach(scenario => {
      if (!groups[scenario.surface]) {
        groups[scenario.surface] = [];
      }
      groups[scenario.surface].push(scenario);
    });
    return groups;
  }

  private calculateTabCoverage(scenarios: ParsedScenario[], testedIds: Set<string>): Record<string, TabCoverage> {
    const tabs: Record<string, TabCoverage> = {};
    const tabGroups = this.groupByTab(scenarios);

    Object.entries(tabGroups).forEach(([tab, tabScenarios]) => {
      const tabTested = tabScenarios.filter(s => testedIds.has(s.id)).length;
      const tabCoverage = (tabTested / tabScenarios.length) * 100;

      const categories = this.calculateCategoryCoverage(tabScenarios, testedIds);

      tabs[tab] = {
        totalScenarios: tabScenarios.length,
        testedScenarios: tabTested,
        coveragePercentage: tabCoverage,
        categories,
      };
    });

    return tabs;
  }

  private groupByTab(scenarios: ParsedScenario[]): Record<string, ParsedScenario[]> {
    const groups: Record<string, ParsedScenario[]> = {};
    scenarios.forEach(scenario => {
      if (!groups[scenario.tab]) {
        groups[scenario.tab] = [];
      }
      groups[scenario.tab].push(scenario);
    });
    return groups;
  }

  private calculateCategoryCoverage(scenarios: ParsedScenario[], testedIds: Set<string>): Record<string, CategoryCoverage> {
    const categories: Record<string, CategoryCoverage> = {};
    const categoryGroups = this.groupByCategory(scenarios);

    Object.entries(categoryGroups).forEach(([category, categoryScenarios]) => {
      const categoryTested = categoryScenarios.filter(s => testedIds.has(s.id)).length;
      const categoryCoverage = (categoryTested / categoryScenarios.length) * 100;

      const scenarioList = categoryScenarios.map(s => ({
        scenario: s.errorType,
        tested: testedIds.has(s.id),
      }));

      categories[category] = {
        totalScenarios: categoryScenarios.length,
        testedScenarios: categoryTested,
        coveragePercentage: categoryCoverage,
        scenarios: scenarioList,
      };
    });

    return categories;
  }

  private groupByCategory(scenarios: ParsedScenario[]): Record<string, ParsedScenario[]> {
    const groups: Record<string, ParsedScenario[]> = {};
    scenarios.forEach(scenario => {
      if (!groups[scenario.errorCategory]) {
        groups[scenario.errorCategory] = [];
      }
      groups[scenario.errorCategory].push(scenario);
    });
    return groups;
  }

  validateInputCombinationCoverage(scenarios: ParsedScenario[], testFiles: TestFile[]): {
    totalCombinations: number;
    testedCombinations: number;
    coveragePercentage: number;
    gaps: Array<{
      scenario: string;
      combination: string;
      reason: string;
    }>;
  } {
    const totalCombinations = scenarios.reduce((sum, s) => sum + s.inputCombinations.length, 0);
    let testedCombinations = 0;
    const gaps: Array<{ scenario: string; combination: string; reason: string }> = [];

    scenarios.forEach(scenario => {
      const hasTest = testFiles.some(tf => tf.scenario.id === scenario.id);
      if (hasTest) {
        testedCombinations += scenario.inputCombinations.length;
      } else {
        scenario.inputCombinations.forEach(combination => {
          gaps.push({
            scenario: scenario.id,
            combination: combination.description,
            reason: "No test file generated for scenario",
          });
        });
      }
    });

    const coveragePercentage = totalCombinations > 0 ? (testedCombinations / totalCombinations) * 100 : 0;

    return {
      totalCombinations,
      testedCombinations,
      coveragePercentage,
      gaps,
    };
  }
}