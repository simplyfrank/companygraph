import { useState } from "react";
import { api, rdf } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { ViewHeader, Loading, ErrorState } from "../_shared";

interface LabelRow { label: string; count: number }

export function OntologyCatalog() {
  const [exportFormat, setExportFormat] = useState<"jsonld" | "turtle" | "ntriples">("jsonld");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ classes_created: number; properties_created: number; errors: string[] } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Per-label counts. graph-core ships a closed registry of 6 labels;
  // ontology-manager unfreezes this into a CRUD-able catalog.
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (n)
        WITH labels(n)[0] AS label, count(n) AS count
        RETURN label, count
        ORDER BY label
        LIMIT 1001
      `),
    [refreshKey],
  );

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await rdf.export(exportFormat);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ontology.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Failed to export ontology");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".jsonld,.ttl,.nt,.turtle";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsImporting(true);
      setImportResult(null);
      try {
        const content = await file.text();
        const result = await rdf.import(content, exportFormat);
        setImportResult(result);
        // Refresh the catalog data
        setRefreshKey((k) => k + 1);
      } catch (e) {
        console.error("Import failed:", e);
        alert("Failed to import ontology");
      } finally {
        setIsImporting(false);
      }
    };
    input.click();
  };

  return (
    <>
      <ViewHeader
        title="Entity catalogue"
        lede="Every node label in the graph with its instance count. graph-core's registry is closed at 6 labels — ontology-manager unfreezes it."
      />
      <Card 
        title="Labels"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select 
              value={exportFormat} 
              onChange={(e) => setExportFormat(e.target.value as any)}
              style={{ padding: 4, borderRadius: 4, border: "1px solid var(--border)" }}
            >
              <option value="jsonld">JSON-LD</option>
              <option value="turtle">Turtle</option>
              <option value="ntriples">N-Triples</option>
            </select>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? "Exporting..." : "Export RDF"}
            </Button>
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting ? "Importing..." : "Import RDF"}
            </Button>
          </div>
        }
      >
        {importResult && (
          <div style={{ marginBottom: 16, padding: 12, background: "var(--bg-subtle)", borderRadius: 4 }}>
            <strong>Import Result:</strong>
            <div>Classes created: {importResult.classes_created}</div>
            <div>Properties created: {importResult.properties_created}</div>
            {importResult.errors.length > 0 && (
              <div style={{ color: "var(--danger)" }}>
                Errors: {importResult.errors.join(", ")}
              </div>
            )}
          </div>
        )}
        {data.status === "loading" && <Loading what="catalog" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (
          <DataTable
            columns={[
              { id: "label",  label: "label",      kind: "text" },
              { id: "count",  label: "instances",  kind: "num", align: "right" },
              { id: "source", label: "source",     kind: "text" },
            ]}
            rows={(data.data.rows as unknown as LabelRow[]).map((r) => ({
              label: <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{r.label}</code>,
              count: r.count,
              source: <Pill tone="accent">graph-core registry</Pill>,
            }))}
          />
        )}
      </Card>
    </>
  );
}
