// T-02 unit tests — shared zod schemas for the ontology-manager spec.
//
// Verifies the FR-01a supported-subset contract: each named JSON Schema
// keyword either parses cleanly (when supported) or trips Zod's .strict()
// rejection (when unsupported). Also smoke-tests the discriminated-union
// migration schema and the node-label naming guards.

import { describe, test, expect } from "bun:test";
import {
  jsonSchemaDocSchema,
  nodeLabelCreateSchema,
  edgeTypeCreateSchema,
  migrationCreateSchema,
} from "../src/schema/ontology";

describe("jsonSchemaDocSchema — supported subset (FR-01a)", () => {
  describe("supported keywords parse cleanly", () => {
    test("type as string", () => {
      expect(jsonSchemaDocSchema.safeParse({ type: "string" }).success).toBe(true);
    });
    test("type as array of strings", () => {
      expect(
        jsonSchemaDocSchema.safeParse({ type: ["string", "null"] }).success,
      ).toBe(true);
    });
    test("nested object with required + properties + additionalProperties=false", () => {
      const r = jsonSchemaDocSchema.safeParse({
        type: "object",
        required: ["foo"],
        properties: {
          foo: { type: "string", minLength: 1, maxLength: 10 },
          bar: { type: "integer", minimum: 0, maximum: 100, multipleOf: 5 },
        },
        additionalProperties: false,
      });
      expect(r.success).toBe(true);
    });
    test("array with items.type", () => {
      expect(
        jsonSchemaDocSchema.safeParse({
          type: "array",
          items: { type: "string", pattern: "^[A-Z]+$" },
        }).success,
      ).toBe(true);
    });
    test("enum + default", () => {
      expect(
        jsonSchemaDocSchema.safeParse({
          type: "string",
          enum: ["a", "b", "c"],
          default: "a",
        }).success,
      ).toBe(true);
    });
    test("exclusiveMinimum + exclusiveMaximum", () => {
      expect(
        jsonSchemaDocSchema.safeParse({
          type: "number",
          exclusiveMinimum: 0,
          exclusiveMaximum: 1,
        }).success,
      ).toBe(true);
    });
    test("format keyword", () => {
      expect(
        jsonSchemaDocSchema.safeParse({ type: "string", format: "email" }).success,
      ).toBe(true);
    });
  });

  describe("unsupported keywords are rejected at register time", () => {
    // From FR-01a's explicit out-of-scope list:
    const unsupportedKeywords: Array<{ keyword: string; value: unknown }> = [
      { keyword: "oneOf", value: [{ type: "string" }, { type: "number" }] },
      { keyword: "anyOf", value: [{ type: "string" }, { type: "number" }] },
      { keyword: "allOf", value: [{ type: "string" }] },
      { keyword: "not", value: { type: "string" } },
      { keyword: "if", value: { type: "string" } },
      { keyword: "then", value: { type: "string" } },
      { keyword: "else", value: { type: "string" } },
      { keyword: "$ref", value: "#/definitions/Foo" },
      { keyword: "const", value: "specific-value" },
      { keyword: "contentEncoding", value: "base64" },
      { keyword: "contentMediaType", value: "image/png" },
      { keyword: "dependentSchemas", value: {} },
      { keyword: "dependentRequired", value: {} },
    ];

    for (const { keyword, value } of unsupportedKeywords) {
      test(`'${keyword}' is rejected`, () => {
        const r = jsonSchemaDocSchema.safeParse({
          type: "object",
          [keyword]: value,
        });
        expect(r.success).toBe(false);
      });
    }
  });
});

describe("nodeLabelCreateSchema — name validation (FR-02)", () => {
  test("valid PascalCase name accepted", () => {
    const r = nodeLabelCreateSchema.safeParse({
      name: "Product",
      description: "A retail product line.",
      usage_example: "POST /api/v1/nodes/Product",
      json_schema_doc: { type: "object" },
    });
    expect(r.success).toBe(true);
  });
  test("rejects lowercase initial", () => {
    const r = nodeLabelCreateSchema.safeParse({
      name: "product",
      description: "x",
      usage_example: "y",
      json_schema_doc: { type: "object" },
    });
    expect(r.success).toBe(false);
  });
  test("rejects _-prefixed (reserved for meta-labels)", () => {
    const r = nodeLabelCreateSchema.safeParse({
      name: "_Reserved",
      description: "x",
      usage_example: "y",
      json_schema_doc: { type: "object" },
    });
    expect(r.success).toBe(false);
  });
  test("rejects blank description (FR-10)", () => {
    const r = nodeLabelCreateSchema.safeParse({
      name: "Product",
      description: "",
      usage_example: "y",
      json_schema_doc: { type: "object" },
    });
    expect(r.success).toBe(false);
  });
});

describe("edgeTypeCreateSchema — SCREAMING_SNAKE + ≥1 endpoint", () => {
  test("accepts SCREAMING_SNAKE name + non-empty endpoints", () => {
    const r = edgeTypeCreateSchema.safeParse({
      name: "USES_SYSTEM",
      description: "An activity uses a system.",
      usage_example: "POST /edges {type:'USES_SYSTEM', ...}",
      endpoints: [{ fromLabel: "Activity", toLabel: "System" }],
    });
    expect(r.success).toBe(true);
  });
  test("rejects PascalCase edge name", () => {
    const r = edgeTypeCreateSchema.safeParse({
      name: "UsesSystem",
      description: "x",
      usage_example: "y",
      endpoints: [{ fromLabel: "Activity", toLabel: "System" }],
    });
    expect(r.success).toBe(false);
  });
  test("rejects empty endpoints array", () => {
    const r = edgeTypeCreateSchema.safeParse({
      name: "FOO",
      description: "x",
      usage_example: "y",
      endpoints: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("migrationCreateSchema — discriminated union (FR-16, design pass-1 C-09)", () => {
  test("rename_attribute parses with the right transform shape", () => {
    const r = migrationCreateSchema.safeParse({
      type: "rename_attribute",
      target: "Activity",
      transform: { from_key: "old_name", to_key: "new_name" },
    });
    expect(r.success).toBe(true);
  });
  test("split_label requires mapping", () => {
    const r = migrationCreateSchema.safeParse({
      type: "split_label",
      target: "Item",
      transform: {
        predicate_key: "kind",
        mapping: { sku: "Product", srv: "Service" },
      },
    });
    expect(r.success).toBe(true);
  });
  test("rejects unknown type", () => {
    const r = migrationCreateSchema.safeParse({
      type: "weird_thing",
      target: "X",
      transform: {},
    });
    expect(r.success).toBe(false);
  });
  test("rejects rename_attribute with the wrong transform shape", () => {
    const r = migrationCreateSchema.safeParse({
      type: "rename_attribute",
      target: "Activity",
      transform: { from_key: "x" }, // missing to_key
    });
    expect(r.success).toBe(false);
  });
});
