import { useEffect, type ReactNode } from "react";
import { useSchemaStore, STATIC_SCHEMA_FALLBACK } from "../store/schemaStore";

// Renders its children once the schema cache is hydrated. Per design
// §4.3 + §4.4 C-03:
//   - 200 → cache + render children
//   - 304 → no-op + render children (cache stayed warm)
//   - 404 → silent fall-through to STATIC_SCHEMA_FALLBACK + one-time
//           console warning, then render children
//   - 5xx / network error → render the `fallback` (`<ErrorState/>`)
//
// The 404 vs 5xx split is the load-bearing distinction: 404 means
// "ontology-manager not yet deployed, use static tuples" (not an
// error); 5xx means "service broken, surface for retry".

let warnedAboutStaticFallback = false;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  loading?: ReactNode;
}

export function SchemaBootstrap({ children, fallback, loading }: Props) {
  const schema = useSchemaStore((s) => s.schema);
  const loadingState = useSchemaStore((s) => s.loading);
  const error = useSchemaStore((s) => s.error);
  const refresh = useSchemaStore((s) => s.refresh);

  useEffect(() => {
    if (schema === null && !loadingState && !error) {
      void refresh();
    }
  }, [schema, loadingState, error, refresh]);

  // Emit one-time warning when we fall back to static schema.
  useEffect(() => {
    if (
      schema === STATIC_SCHEMA_FALLBACK &&
      !warnedAboutStaticFallback &&
      typeof console !== "undefined"
    ) {
      console.warn(
        "[schemaStore] /api/v1/schema returned 404 — falling back to compile-time " +
          "NODE_LABELS/EDGE_TYPES (set VITE_SCHEMA_SOURCE=static to suppress this " +
          "warning). When ontology-manager ships, this fallback path will deactivate.",
      );
      warnedAboutStaticFallback = true;
    }
  }, [schema]);

  if (error) {
    return (
      <>
        {fallback ?? (
          <div role="alert" data-test-id="schema-bootstrap-error">
            <p>Schema service is unavailable.</p>
            <p>{error}</p>
            <button type="button" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}
      </>
    );
  }

  if (!schema) {
    return <>{loading ?? <div data-test-id="schema-bootstrap-loading">Loading…</div>}</>;
  }

  return <>{children}</>;
}

// Test-only: reset the one-time warning flag.
export function _resetSchemaBootstrapWarning() {
  warnedAboutStaticFallback = false;
}
