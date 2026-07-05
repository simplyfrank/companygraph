// business-model-authoring T-02 — proves the reuse seam exists (design
// §4.7 / OQ-1 (a)): `realImport` is exported from routes/import.ts so
// the authoring-apply handler can call it in-process. No behavior
// change to import.ts is asserted here beyond the export itself.

import { describe, expect, test } from "bun:test";
import { realImport, handleImport } from "../src/routes/import";

describe("business-model-authoring T-02 realImport export", () => {
  test("realImport is exported and is a function", () => {
    expect(typeof realImport).toBe("function");
  });

  test("handleImport remains exported alongside it (unchanged seam)", () => {
    expect(typeof handleImport).toBe("function");
  });
});
