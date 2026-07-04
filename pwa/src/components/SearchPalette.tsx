import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type SearchHit } from "../api";
import { useSchemaStore } from "../store/schemaStore";

// FR-08 / AC-05 — global search palette.
//
// Keyboard contract:
//   "/"        → open palette + focus input (unless typing in another input)
//   ArrowDown  → next result (wraps within and across label groups)
//   ArrowUp    → previous result
//   Enter      → navigate to the selected result's deep-link
//   Escape     → close and return focus to the previous element
//
// Fan-out: one parallel api.search(label, q, 20) per current label in
// the schema cache. Results are grouped by label in the dropdown.
//
// Native conflict (design §8): the "/" handler preventDefaults browser
// quick-find on macOS Safari + Chrome when the focus is outside an
// editable field.

type Result = SearchHit;

// Resolve `(label, id)` to the deep-link hash the dispatcher recognises.
function hrefForHit(hit: Result): string {
  const id = encodeURIComponent(hit.id);
  switch (hit.label) {
    case "Domain":      return `#/explorer/domains/${id}`;
    case "UserJourney": return `#/explorer/journey-detail/${id}`;
    case "Activity":    return `#/explorer/activities/${id}`;
    case "System":      return `#/explorer/systems/${id}`;
    case "Role":        return `#/explorer/roles/${id}`;
    case "Location":    return `#/explorer/locations/${id}`;
    default:            return "#/explorer/domains";
  }
}

interface Props {
  // When provided, the palette renders inline-controlled. Used by the
  // test harness to bypass the document-level keydown listener.
  forceOpen?: boolean;
}

export function SearchPalette({ forceOpen }: Props = {}) {
  const [open, setOpen] = useState<boolean>(Boolean(forceOpen));
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Refs shadow `results` + `selectedIdx` so handlers can read the
  // latest values inside a single fireEvent/event-loop tick — React
  // state setters are async, which otherwise breaks ArrowDown+Enter
  // sequences fired back-to-back.
  const resultsRef = useRef<Result[]>([]);
  const selectedIdxRef = useRef(0);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);
  useEffect(() => {
    selectedIdxRef.current = selectedIdx;
  }, [selectedIdx]);

  const schema = useSchemaStore((s) => s.schema);
  const labels = useMemo<string[]>(
    () => (schema?.nodeLabels ?? []).map((l) => l.name),
    [schema],
  );

  // Open on "/" outside an editable field; close on "Escape".
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editable =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable === true;
      if (e.key === "/" && !editable) {
        e.preventDefault();
        lastTriggerRef.current = (document.activeElement as HTMLElement) ?? null;
        setOpen(true);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        lastTriggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the input when opening.
  useEffect(() => {
    if (open) {
      // Defer a tick so the input is in the DOM.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return;
  }, [open]);

  // Debounced search fan-out — re-runs when q or labels change.
  useEffect(() => {
    if (!open) return;
    if (!q.trim()) {
      setResults([]);
      setSelectedIdx(0);
      return;
    }
    if (labels.length === 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const settled = await Promise.allSettled(
          labels.map((label) =>
            api.search(label, q.trim(), 20, controller.signal),
          ),
        );
        const merged: Result[] = [];
        for (const s of settled) {
          if (s.status === "fulfilled") {
            for (const row of s.value.rows) merged.push(row);
          }
        }
        // Group order: keep the order labels appear in the schema.
        merged.sort((a, b) => {
          const ai = labels.indexOf(a.label);
          const bi = labels.indexOf(b.label);
          if (ai !== bi) return ai - bi;
          return a.name.localeCompare(b.name);
        });
        setResults(merged);
        resultsRef.current = merged;
        setSelectedIdx(0);
        selectedIdxRef.current = 0;
      } catch {
        // Aborted or network error — leave prior results untouched.
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [q, open, labels]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>): void {
    const liveResults = resultsRef.current;
    const liveIdx = selectedIdxRef.current;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = liveResults.length === 0 ? 0 : (liveIdx + 1) % liveResults.length;
      selectedIdxRef.current = next;
      setSelectedIdx(next);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        liveResults.length === 0
          ? 0
          : (liveIdx - 1 + liveResults.length) % liveResults.length;
      selectedIdxRef.current = next;
      setSelectedIdx(next);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = liveResults[selectedIdxRef.current];
      if (hit) {
        window.location.hash = hrefForHit(hit);
        setOpen(false);
        lastTriggerRef.current?.focus();
      }
    }
  }

  if (!open) return null;

  // Group results by label for display.
  const grouped = labels
    .map((label) => ({
      label,
      rows: results.filter((r) => r.label === label),
    }))
    .filter((g) => g.rows.length > 0);

  let runningIdx = -1;
  const node = (
    <div
      data-testid="search-palette"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.35)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 80,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setOpen(false);
          lastTriggerRef.current?.focus();
        }
      }}
    >
      <div
        style={{
          width: "min(640px, 92vw)",
          background: "var(--bg, #fff)",
          color: "var(--fg, #111)",
          border: "1px solid var(--rule, #ddd)",
          borderRadius: 8,
          boxShadow: "0 10px 32px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          data-testid="search-palette-input"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="search-palette-listbox"
          aria-activedescendant={
            results[selectedIdx]
              ? `search-palette-row-${selectedIdx}`
              : undefined
          }
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search nodes by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          style={{
            width: "100%",
            padding: "12px 16px",
            border: "none",
            borderBottom: "1px solid var(--rule, #ddd)",
            background: "transparent",
            color: "inherit",
            fontSize: 16,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div
          id="search-palette-listbox"
          role="listbox"
          aria-label="Search results"
          data-testid="search-palette-listbox"
          style={{ maxHeight: "60vh", overflowY: "auto" }}
        >
          {loading && results.length === 0 && (
            <div style={{ padding: 12, color: "var(--muted)" }}>Searching…</div>
          )}
          {!loading && q.trim() && results.length === 0 && (
            <div
              data-testid="search-palette-empty"
              style={{ padding: 12, color: "var(--muted)" }}
            >
              No matches for &ldquo;{q}&rdquo;.
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.label}>
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontSize: 11,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  letterSpacing: 0.5,
                }}
              >
                {g.label} ({g.rows.length})
              </div>
              {g.rows.map((row) => {
                runningIdx += 1;
                const isSelected = runningIdx === selectedIdx;
                return (
                  <a
                    key={`${row.label}:${row.id}`}
                    id={`search-palette-row-${runningIdx}`}
                    role="option"
                    aria-selected={isSelected}
                    data-testid="search-palette-row"
                    data-label={row.label}
                    href={hrefForHit(row)}
                    onClick={() => {
                      setOpen(false);
                      lastTriggerRef.current?.focus();
                    }}
                    style={{
                      display: "block",
                      padding: "8px 16px",
                      textDecoration: "none",
                      color: "inherit",
                      background: isSelected ? "var(--accent-bg, #eef)" : "transparent",
                      fontSize: 14,
                    }}
                  >
                    {row.name}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Portal so the palette renders above any positioned ancestor.
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
