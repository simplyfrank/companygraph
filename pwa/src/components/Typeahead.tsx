import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type SearchHit } from "../api";

// FR-17 / AC-14 — reusable label-scoped typeahead for SME write paths.
//
// Contract:
//   - Calls `api.search(label, q, 20)` on each query keystroke (debounced).
//   - Renders the top 20 matches in a portal above the input so Safari's
//     Smart Search and `<input>` autocomplete drawers cannot obscure them.
//   - Offers a "Create new '<q>'" inline option when q has no exact name
//     match in the current result set; selecting it POSTs to
//     `/api/v1/nodes/:label` and binds the newly created node in one click.
//
// Native-conflict suppressions (design §8):
//   - `autocomplete="off" autoCorrect="off" spellCheck={false}`
//   - `aria-autocomplete="list"` so screen readers announce the listbox.

export interface TypeaheadProps {
  /** Label to scope the search (e.g. "Role", "System", "Location"). */
  label: string;
  /** Placeholder text in the input. */
  placeholder?: string;
  /** Called when the user picks an existing match. */
  onSelect: (hit: SearchHit) => void;
  /** Called when the user picks "Create new" and the POST returns. */
  onCreate?: (created: { id: string; name: string; label: string }) => void;
  /** Optional initial value for the input. */
  initialQuery?: string;
  /** Debounce window in ms — default 120 (the AC-14 < 200 ms latency budget). */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 120;

export function Typeahead({
  label,
  placeholder,
  onSelect,
  onCreate,
  initialQuery,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: TypeaheadProps) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);

  // Debounced search.
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setSelectedIdx(0);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const res = await api.search(label, q.trim(), 20, controller.signal);
        setResults(res.rows);
        setSelectedIdx(0);
      } catch {
        // Abort or transient — leave prior list untouched.
      } finally {
        setLoading(false);
      }
    }, debounceMs);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [q, label, debounceMs]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent): void {
      const t = e.target as Node | null;
      if (!t) return;
      if (inputRef.current?.contains(t)) return;
      if (portalRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // FR-17 fast-path: an exact case-insensitive name match in the result
  // set suppresses the "Create new" option (otherwise we'd double-list).
  const hasExactMatch = results.some(
    (r) => r.name.toLowerCase() === q.trim().toLowerCase(),
  );
  const showCreate =
    q.trim().length > 0 && !hasExactMatch && Boolean(onCreate);

  // The visual list = results + optional "Create new" trailer. selectedIdx
  // indexes into this combined list.
  const totalRows = results.length + (showCreate ? 1 : 0);

  function pick(idx: number): void {
    if (idx < results.length) {
      const hit = results[idx]!;
      setQ(hit.name);
      setOpen(false);
      onSelect(hit);
      return;
    }
    // "Create new" trailer
    if (showCreate) {
      void createInline();
    }
  }

  async function createInline(): Promise<void> {
    if (!onCreate || !q.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/nodes/${encodeURIComponent(label)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: q.trim(), description: "" }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${detail}`);
      }
      const created = (await res.json()) as { id: string; name: string };
      const node = { id: created.id, name: created.name, label };
      setQ(node.name);
      setOpen(false);
      onCreate(node);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setSelectedIdx((i) => (totalRows === 0 ? 0 : (i + 1) % totalRows));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) =>
        totalRows === 0 ? 0 : (i - 1 + totalRows) % totalRows,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      pick(selectedIdx);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  // Position the portal directly under the input.
  const rect = inputRef.current?.getBoundingClientRect();

  return (
    <div
      data-testid={`typeahead-${label.toLowerCase()}`}
      style={{ position: "relative", display: "inline-block", width: "100%" }}
    >
      <input
        ref={inputRef}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && totalRows > 0}
        aria-controls={`typeahead-${label}-listbox`}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-testid={`typeahead-${label.toLowerCase()}-input`}
        value={q}
        placeholder={placeholder ?? `Find or create ${label}`}
        onChange={(e) => {
          setQ(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        style={{
          width: "100%",
          padding: "8px 10px",
          border: "1px solid var(--rule)",
          borderRadius: 4,
          fontSize: 14,
          boxSizing: "border-box",
        }}
      />
      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={portalRef}
            id={`typeahead-${label}-listbox`}
            role="listbox"
            data-testid={`typeahead-${label.toLowerCase()}-listbox`}
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.left,
              width: rect.width,
              maxHeight: 320,
              overflowY: "auto",
              background: "var(--bg)",
              color: "var(--fg)",
              border: "1px solid var(--rule)",
              borderRadius: 4,
              boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
              zIndex: 9999,
              fontSize: 13,
            }}
          >
            {loading && results.length === 0 && (
              <div style={{ padding: 8, color: "var(--muted)" }}>Searching…</div>
            )}
            {!loading && q.trim().length === 0 && (
              <div style={{ padding: 8, color: "var(--muted)" }}>
                Type to search {label} nodes.
              </div>
            )}
            {results.map((r, idx) => (
              <div
                key={r.id}
                role="option"
                aria-selected={idx === selectedIdx}
                data-testid="typeahead-row"
                onMouseDown={(e) => {
                  // Prevent input blur so onSelect fires synchronously.
                  e.preventDefault();
                  pick(idx);
                }}
                style={{
                  padding: "6px 10px",
                  cursor: "pointer",
                  background:
                    idx === selectedIdx ? "var(--accent-bg)" : "transparent",
                }}
              >
                {r.name}
              </div>
            ))}
            {showCreate && (
              <div
                role="option"
                aria-selected={selectedIdx === results.length}
                data-testid="typeahead-create-new"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void createInline();
                }}
                style={{
                  padding: "6px 10px",
                  cursor: creating ? "wait" : "pointer",
                  borderTop: results.length > 0 ? "1px solid var(--rule)" : "none",
                  background:
                    selectedIdx === results.length
                      ? "var(--accent-bg)"
                      : "transparent",
                  color: "var(--accent)",
                }}
              >
                {creating
                  ? `Creating "${q.trim()}"…`
                  : `+ Create new ${label} "${q.trim()}"`}
              </div>
            )}
            {error && (
              <div
                data-testid="typeahead-error"
                style={{ padding: 8, color: "var(--danger)", fontSize: 12 }}
              >
                {error}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
