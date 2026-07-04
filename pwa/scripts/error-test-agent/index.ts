#!/usr/bin/env bun
// Error Test Generation Agent
// Main entry point for generating comprehensive error scenario tests

import { ScenarioParser } from "./scenario-parser";
import { TestBuilder } from "./test-builder";
import { MockGenerator } from "./mock-generator";
import { CoverageValidator } from "./coverage-validator";
import { TestOrganizer } from "./test-organizer";
import { ERROR_SCENARIO_CATALOG } from "./error-scenario-catalog";

interface AgentConfig {
  errorScenarioCatalog: string;
  outputDirectory: string;
  fixtureDirectory: string;
  coverageThreshold: number;
  testFramework: "vitest";
  existingTestPatterns: boolean;
}

const DEFAULT_CONFIG: AgentConfig = {
  errorScenarioCatalog: "./error-scenario-catalog.ts",
  outputDirectory: "./src/__tests__/error-scenarios",
  fixtureDirectory: "./src/__tests__/fixtures/error-scenarios",
  coverageThreshold: 100,
  testFramework: "vitest",
  existingTestPatterns: true,
};

class ErrorTestGenerator {
  private config: AgentConfig;
  private scenarioParser: ScenarioParser;
  private testBuilder: TestBuilder;
  private mockGenerator: MockGenerator;
  private coverageValidator: CoverageValidator;
  private testOrganizer: TestOrganizer;

  constructor(config: Partial<AgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scenarioParser = new ScenarioParser(this.config);
    this.testBuilder = new TestBuilder(this.config);
    this.mockGenerator = new MockGenerator(this.config);
    this.coverageValidator = new CoverageValidator(this.config);
    this.testOrganizer = new TestOrganizer(this.config);
  }

  async generate(): Promise<void> {
    console.log("🚀 Starting Error Test Generation Agent");
    console.log(`📋 Config: ${JSON.stringify(this.config, null, 2)}`);

    try {
      // Step 1: Parse error scenario catalog
      console.log("\n📖 Step 1: Parsing error scenario catalog...");
      const parsedScenarios = this.scenarioParser.parseCatalog(ERROR_SCENARIO_CATALOG);
      console.log(`✅ Parsed ${parsedScenarios.all.length} scenarios`);

      // Step 2: Generate mock fixtures
      console.log("\n🔧 Step 2: Generating mock fixtures...");
      const mockFixtures = await this.mockGenerator.generateFixtures(parsedScenarios.all);
      console.log(`✅ Generated ${mockFixtures.length} mock fixtures`);

      // Step 3: Build test files
      console.log("\n🧪 Step 3: Building test files...");
      const testFiles = await this.testBuilder.buildTests(parsedScenarios.all, mockFixtures);
      console.log(`✅ Built ${testFiles.length} test files`);

      // Step 4: Organize test files
      console.log("\n📁 Step 4: Organizing test files...");
      const organizedTests = this.testOrganizer.organizeTests(testFiles);
      console.log(`✅ Organized ${organizedTests.length} test files`);

      // Step 5: Write test files to disk
      console.log("\n✍️  Step 5: Writing test files to disk...");
      await this.testOrganizer.writeTests(testFiles);
      await this.testOrganizer.writeMockFixtures(mockFixtures);
      await this.testOrganizer.writeTestIndex(organizedTests);
      console.log(`✅ Wrote ${testFiles.length} test files and ${mockFixtures.length} mock fixtures`);

      // Step 6: Validate coverage
      console.log("\n📊 Step 6: Validating coverage...");
      const coverageReport = this.coverageValidator.validateCoverage(parsedScenarios.all, organizedTests.all);
      console.log(`✅ Coverage: ${coverageReport.coveragePercentage.toFixed(1)}%`);

      // Step 6: Report results
      this.printResults(coverageReport);

      if (coverageReport.coveragePercentage < this.config.coverageThreshold) {
        console.warn(`⚠️  Coverage below threshold (${this.config.coverageThreshold}%)`);
        process.exit(1);
      }

      console.log("\n✨ Error test generation complete!");
    } catch (error) {
      console.error("❌ Error during test generation:", error);
      process.exit(1);
    }
  }

  private printResults(report: any): void {
    console.log("\n📈 Coverage Report:");
    console.log(`  Total Scenarios: ${report.totalScenarios}`);
    console.log(`  Tested Scenarios: ${report.testedScenarios}`);
    console.log(`  Coverage: ${report.coveragePercentage.toFixed(1)}%`);

    if (report.gaps.length > 0) {
      console.log("\n⚠️  Coverage Gaps:");
      report.gaps.forEach((gap: any) => {
        console.log(`  - ${gap.surface}/${gap.tab}: ${gap.scenario} (${gap.reason})`);
      });
    }

    console.log("\n📊 Coverage by Surface:");
    Object.entries(report.bySurface).forEach(([surface, data]: [string, any]) => {
      console.log(`  ${surface}: ${data.coveragePercentage.toFixed(1)}% (${data.testedScenarios}/${data.totalScenarios})`);
    });
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const config: Partial<AgentConfig> = {};

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--output":
        config.outputDirectory = args[++i];
        break;
      case "--threshold":
        config.coverageThreshold = parseFloat(args[++i]);
        break;
      case "--help":
        console.log(`
Error Test Generation Agent

Usage: bun run scripts/error-test-agent/index.ts [options]

Options:
  --output <dir>       Output directory for generated tests (default: ./src/__tests__/error-scenarios)
  --threshold <num>    Minimum coverage percentage (default: 100)
  --help               Show this help message

Examples:
  bun run scripts/error-test-agent/index.ts
  bun run scripts/error-test-agent/index.ts --output ./custom-tests
  bun run scripts/error-test-agent/index.ts --threshold 95
        `);
        process.exit(0);
    }
  }

  const generator = new ErrorTestGenerator(config);
  await generator.generate();
}

// Run if executed directly
if (import.meta.path === Bun.main) {
  main();
}

export { ErrorTestGenerator, AgentConfig };