// T-03 — error-code registry exhaustiveness test (design pass-1 C-02).
//
// Passes iff `ERROR_CODE_THROWERS` is exhaustive over `ONTOLOGY_ERROR_CODES`.
// No per-throw-site annotations needed; call sites import + invoke the
// named thrower, which carries the code via the registry. Adding a new
// error code is a two-step change: enum + thrower. This test catches a
// half-step (e.g. enum bumped but no thrower) at unit-test time.

import { describe, test, expect } from "bun:test";
import { ONTOLOGY_ERROR_CODES, type OntologyErrorCode } from "../src/ontology/errors";
import { ERROR_CODE_THROWERS } from "../src/ontology/error-throwers";
import { ValidationError } from "../src/errors";

describe("ontology error-code registry — exhaustive", () => {
  test("ERROR_CODE_THROWERS key set === ONTOLOGY_ERROR_CODES", () => {
    const enumKeys = [...ONTOLOGY_ERROR_CODES].sort();
    const registryKeys = (Object.keys(ERROR_CODE_THROWERS) as OntologyErrorCode[]).sort();
    expect(registryKeys).toEqual(enumKeys);
  });

  test("every thrower is callable", () => {
    for (const code of ONTOLOGY_ERROR_CODES) {
      const fn = (ERROR_CODE_THROWERS as Record<string, unknown>)[code];
      expect(typeof fn).toBe("function");
    }
  });

  test("each thrower emits the right code via ValidationError", () => {
    // Walk every code. Construct a minimal details payload that satisfies
    // each thrower's signature (the registry doesn't validate `details`
    // shape at runtime — only the type system does). Catch the thrown
    // ValidationError, assert its `code` field matches.
    const minimalDetails: Record<OntologyErrorCode, Record<string, unknown>> = {
      invalid_payload: { fieldErrors: { foo: ["bad"] } },
      unsupported_jsonschema_keyword: { keyword: "oneOf" },
      missing_documentation: { field: "description" },
      name_conflict: { name: "X" },
      not_found: { name: "X" },
      type_pair_violation: { unknown_label: "X" },
      schema_breaking: { affected_edge_count: 1, sample_edge_ids: ["x"] },
      deprecation_required: { precondition_failed: "node_instance_count" },
      would_invalidate: {
        affected_count: 1,
        sample_node_ids: ["x"],
        newly_required: ["foo"],
        suggested_backfill: "string",
      },
      rollback_orphans: { affected_labels: ["X"], count: 1 },
      rollback_below_bootstrap: { version_id: "v" },
      attribute_violation: { missing: ["foo"] },
      migration_failed: { migration_id: "m" },
      edge_endpoint_label_mismatch: {
        type: "FOO",
        fromLabel: "A",
        toLabel: "B",
        allowed: [],
      },
    };

    for (const code of ONTOLOGY_ERROR_CODES) {
      const thrower = (
        ERROR_CODE_THROWERS as Record<OntologyErrorCode, (d: Record<string, unknown>) => never>
      )[code];
      let captured: unknown = null;
      try {
        thrower(minimalDetails[code]);
      } catch (e) {
        captured = e;
      }
      expect(captured).toBeInstanceOf(ValidationError);
      expect((captured as ValidationError).code).toBe(code);
    }
  });

  test("httpStatus mapping: 4xx for client errors", () => {
    // Spot-check a few representative httpStatus values per design §5.3.
    const expected: Partial<Record<OntologyErrorCode, number>> = {
      invalid_payload: 400,
      missing_documentation: 400,
      not_found: 404,
      name_conflict: 409,
      deprecation_required: 409,
      would_invalidate: 409,
    };
    for (const [code, status] of Object.entries(expected)) {
      const thrower = (
        ERROR_CODE_THROWERS as Record<string, (d: Record<string, unknown>) => never>
      )[code];
      let captured: unknown = null;
      try {
        // Minimal payload; the type system won't catch us calling with `{}`
        // because the registry is typed but we're indexing through a string key.
        thrower({ field: "description", precondition_failed: "node_instance_count" });
      } catch (e) {
        captured = e;
      }
      expect((captured as ValidationError).httpStatus).toBe(status as number);
    }
  });
});
