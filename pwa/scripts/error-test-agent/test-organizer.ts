// Test Organizer - Organizes test files and writes them to disk
import type { TestFile, AgentConfig } from "./test-builder";
import { writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";

export interface OrganizedTests {
  bySurface: Record<string, TestFile[]>;
  byTab: Record<string, Record<string, TestFile[]>>;
  byCategory: Record<string, Record<string, Record<string, TestFile[]>>>;
  all: TestFile[];
}

export class TestOrganizer {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  organizeTests(testFiles: TestFile[]): OrganizedTests {
    const organized: OrganizedTests = {
      bySurface: {},
      byTab: {},
      byCategory: {},
      all: testFiles,
    };

    testFiles.forEach(testFile => {
      const scenario = testFile.scenario;

      // Organize by surface
      if (!organized.bySurface[scenario.surface]) {
        organized.bySurface[scenario.surface] = [];
      }
      organized.bySurface[scenario.surface].push(testFile);

      // Organize by surface/tab
      if (!organized.byTab[scenario.surface]) {
        organized.byTab[scenario.surface] = {};
      }
      if (!organized.byTab[scenario.surface][scenario.tab]) {
        organized.byTab[scenario.surface][scenario.tab] = [];
      }
      organized.byTab[scenario.surface][scenario.tab].push(testFile);

      // Organize by surface/tab/category
      if (!organized.byCategory[scenario.surface]) {
        organized.byCategory[scenario.surface] = {};
      }
      if (!organized.byCategory[scenario.surface][scenario.tab]) {
        organized.byCategory[scenario.surface][scenario.tab] = {};
      }
      if (!organized.byCategory[scenario.surface][scenario.tab][scenario.errorCategory]) {
        organized.byCategory[scenario.surface][scenario.tab][scenario.errorCategory] = [];
      }
      organized.byCategory[scenario.surface][scenario.tab][scenario.errorCategory].push(testFile);
    });

    return organized;
  }

  async writeTests(testFiles: TestFile[]): Promise<void> {
    for (const testFile of testFiles) {
      await this.writeTestFile(testFile);
    }
  }

  private async writeTestFile(testFile: TestFile): Promise<void> {
    const fullPath = join(process.cwd(), testFile.path);
    const dir = dirname(fullPath);

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, testFile.content, "utf-8");
      console.log(`✅ Written: ${testFile.path}`);
    } catch (error) {
      console.error(`❌ Failed to write ${testFile.path}:`, error);
      throw error;
    }
  }

  async writeMockFixtures(mockFixtures: any[]): Promise<void> {
    const fixtureDir = join(process.cwd(), this.config.fixtureDirectory);
    
    try {
      await mkdir(fixtureDir, { recursive: true });
      
      // Write individual fixture files
      for (const fixture of mockFixtures) {
        const fixturePath = join(fixtureDir, `${fixture.scenarioId}.ts`);
        await writeFile(fixturePath, fixture.mockCode, "utf-8");
        console.log(`✅ Written fixture: ${fixture.scenarioId}.ts`);
      }

      // Write index file that exports all fixtures
      const indexContent = this.generateFixtureIndex(mockFixtures);
      const indexPath = join(fixtureDir, "index.ts");
      await writeFile(indexPath, indexContent, "utf-8");
      console.log(`✅ Written fixture index: index.ts`);
    } catch (error) {
      console.error(`❌ Failed to write fixtures:`, error);
      throw error;
    }
  }

  private generateFixtureIndex(mockFixtures: any[]): string {
    const exports = mockFixtures
      .map(f => `export { mock${this.toCamelCase(f.scenarioId)} } from "./${f.scenarioId}";`)
      .join("\n");

    return `// Auto-generated fixture index
// This file exports all mock fixtures for error scenario tests

${exports}
`;
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, c => c.toUpperCase());
  }

  generateTestIndex(organizedTests: OrganizedTests): string {
    let content = `// Auto-generated test index
// This file exports all error scenario test modules

`;

    Object.entries(organizedTests.bySurface).forEach(([surface, tests]) => {
      content += `// ${surface.charAt(0).toUpperCase() + surface.slice(1)} Surface\n`;
      tests.forEach(test => {
        const relativePath = test.path.replace(this.config.outputDirectory + "/", "");
        content += `export { default } from "./${relativePath}";\n`;
      });
      content += "\n";
    });

    return content;
  }

  async writeTestIndex(organizedTests: OrganizedTests): Promise<void> {
    const indexContent = this.generateTestIndex(organizedTests);
    const indexPath = join(process.cwd(), this.config.outputDirectory, "index.ts");
    
    try {
      await writeFile(indexPath, indexContent, "utf-8");
      console.log(`✅ Written test index: index.ts`);
    } catch (error) {
      console.error(`❌ Failed to write test index:`, error);
      throw error;
    }
  }
}