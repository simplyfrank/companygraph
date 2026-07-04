import { useState } from "react";
import { queryOntology } from "../api";
import { Card } from "./Card";
import { Button } from "./Button";
import { Loading, ErrorState } from "../views/_shared";

interface QueryResult {
  columns: string[];
  data: Array<Record<string, unknown>>;
  summary: {
    queryType: string;
    query: string;
    executionTimeMs: number;
    resultCount: number;
  };
}

interface HistoryItem {
  query: string;
  type: string;
  timestamp: number;
}

export function QueryBuilder() {
  const [query, setQuery] = useState("");
  const [queryType, setQueryType] = useState<"cypher" | "sparql">("cypher");
  const [isWrite, setIsWrite] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const handleExecute = async () => {
    if (!query.trim()) return;

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      const res = await queryOntology(query, {}, isWrite, queryType);
      setResult(res);
      setHistory((prev) => [
        { query, type: queryType, timestamp: Date.now() },
        ...prev.slice(0, 9), // Keep last 10 queries
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleHistoryClick = (item: HistoryItem) => {
    setQuery(item.query);
    setQueryType(item.type as "cypher" | "sparql");
  };

  const sampleQueries = [
    { label: "List all node labels", query: "MATCH (n) RETURN DISTINCT labels(n)[0] AS label ORDER BY label", type: "cypher" as const },
    { label: "Count nodes by label", query: "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY count DESC", type: "cypher" as const },
    { label: "Find orphan nodes", query: "MATCH (n) WHERE NOT (n)-[]-() RETURN n LIMIT 100", type: "cypher" as const },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Query Builder">
        <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            Type:
            <select 
              value={queryType} 
              onChange={(e) => setQueryType(e.target.value as "cypher" | "sparql")}
              style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: "1px solid var(--border)" }}
            >
              <option value="cypher">Cypher</option>
              <option value="sparql">SPARQL (not yet supported)</option>
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
            <input 
              type="checkbox" 
              checked={isWrite} 
              onChange={(e) => setIsWrite(e.target.checked)}
            />
            Write query
          </label>
        </div>

        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your query here..."
          style={{
            width: "100%",
            minHeight: 120,
            padding: 12,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            border: "1px solid var(--border)",
            borderRadius: 4,
            background: "var(--bg-subtle)",
            color: "var(--text)",
            resize: "vertical",
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {sampleQueries.map((sq) => (
              <Button
                key={sq.label}
                onClick={() => { setQuery(sq.query); setQueryType(sq.type); }}
                tone="default"
              >
                {sq.label}
              </Button>
            ))}
          </div>
          <Button 
            onClick={handleExecute} 
            disabled={isExecuting || !query.trim()}
            tone="primary"
          >
            {isExecuting ? "Executing..." : "Execute Query"}
          </Button>
        </div>

        {error && (
          <div style={{ 
            marginTop: 12, 
            padding: 12, 
            background: "var(--danger-subtle)", 
            borderRadius: 4, 
            color: "var(--danger)",
            fontSize: 13
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </Card>

      {result && (
        <Card title={`Results (${result.summary.resultCount} rows, ${result.summary.executionTimeMs}ms)`}>
          <div style={{ marginBottom: 12, fontSize: 12, color: "var(--muted)" }}>
            <strong>Query Type:</strong> {result.summary.queryType}
          </div>
          {result.data.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {result.columns.map((col) => (
                      <th key={col} style={{ padding: 8, textAlign: "left", fontWeight: 600 }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.slice(0, 100).map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      {result.columns.map((col) => (
                        <td key={col} style={{ padding: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                          {String(row[col] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.data.length > 100 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                  Showing first 100 of {result.data.length} results
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: "var(--muted)" }}>No results returned</p>
          )}
        </Card>
      )}

      {history.length > 0 && (
        <Card title="Query History">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((item, idx) => (
              <div
                key={idx}
                onClick={() => handleHistoryClick(item)}
                style={{
                  padding: 8,
                  background: "var(--bg-subtle)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: "var(--accent)" }}>{item.type.toUpperCase()}</span>
                  <span style={{ color: "var(--muted)" }}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.query}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
