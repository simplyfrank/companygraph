import { useState } from "react";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { KeyValueList } from "../../components/KeyValueList";
import { Modal } from "../../components/Modal";
import { ViewHeader, SecLabel } from "../_shared";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { uuidv7 } from "../../lib/uuidv7";
import { diffPaste, generateRollbackPayload, type DiffPasteOptions, type DiffPasteError } from "../../lib/diffPaste";
import styles from "./Add.module.css";

// T-12: New-journey form (top half of Add.tsx)
// 4-field form + single batched POST /api/v1/import payload
// UUIDv7 client-side generation

interface JourneyForm {
  name: string;
  description: string;
  domainId: string;
}

interface ImportResult {
  nodes: Array<{ id: string; label: string; name: string }>;
  edges: Array<{ id: string; type: string }>;
  errors: Array<{ code: string; message: string }>;
}

export function SmeAdd() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<JourneyForm>({
    name: "",
    description: "",
    domainId: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { kind: "idle" }
    | { kind: "ok"; data: ImportResult }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Bulk paste state (T-13a)
  const [bulkPasteJourneyId, setBulkPasteJourneyId] = useState("");
  const [bulkPasteText, setBulkPasteText] = useState("");
  const [bulkPasteResult, setBulkPasteResult] = useState<
    | { kind: "idle" }
    | { kind: "ok"; data: ImportResult; warnings: string[] }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const domains = useFetch(() => api.listDomains(), []);
  const journeys = useFetch(() => api.cypher(`
    MATCH (j:UserJourney) RETURN j.id AS id, j.name AS name ORDER BY j.name
  `), []);

  const handleBulkPaste = async (): Promise<void> => {
    if (!bulkPasteJourneyId || !bulkPasteText.trim()) {
      setBulkPasteResult({ kind: "error", message: "Journey and activity names are required" });
      return;
    }

    setBusy(true);
    setBulkPasteResult({ kind: "idle" });

    try {
      // Fetch existing activities and edges for the journey
      const existingActivitiesRes = await fetch(
        `/api/v1/query/cypher`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            statement: `
              MATCH (j:UserJourney {id: $journeyId})<-[:PART_OF]-(a:Activity)
              RETURN a.id AS id, a.name AS name, a.description AS description, a.attributes_json AS attributes
            `,
            params: { journeyId: bulkPasteJourneyId },
          }),
        },
      );
      const existingActivitiesData = await existingActivitiesRes.json();
      const existingActivities: Array<{ id: string; name: string; description: string; attributes: Record<string, unknown> }> = (existingActivitiesData.rows || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        attributes: r.attributes,
      }));

      const existingEdgesRes = await fetch(
        `/api/v1/query/cypher`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            statement: `
              MATCH ()-[r]->() WHERE r.id IN $edgeIds
              RETURN r.id AS id, type(r) AS type, startNode(r).id AS from, endNode(r).id AS to
            `,
            params: {
              edgeIds: [
                ...existingActivities.map((a) => a.id),
                bulkPasteJourneyId,
              ],
            },
          }),
        },
      );
      const existingEdgesData = await existingEdgesRes.json();
      const existingEdges: Array<{ id: string; type: string; from: string; to: string }> = (existingEdgesData.rows || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        type: r.type,
        from: r.from,
        to: r.to,
      }));

      const pasteLines = bulkPasteText.split("\n").map((l) => l.trim()).filter(Boolean);

      // Run diffPaste algorithm
      const diffResult = diffPaste({
        journeyId: bulkPasteJourneyId,
        existingActivities,
        existingPrecedesEdges: existingEdges.filter((e) => e.type === "PRECEDES"),
        existingPartOfEdges: existingEdges.filter((e) => e.type === "PART_OF"),
        pasteLines,
      });

      // Import the diff
      const importPayload = {
        nodes: diffResult.nodes.map((n) => ({
          id: n.id,
          label: "Activity",
          name: n.name,
          description: n.description,
          attributes: n.attributes,
        })),
        edges: diffResult.edges,
      };

      const importRes = await fetch("/api/v1/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(importPayload),
      });

      const importBody = await importRes.json();

      if (!importRes.ok) {
        // Rollback: delete the nodes/edges we just created and restore deleted edges
        const rollbackPayload = generateRollbackPayload(
          diffResult.snapshot,
          diffResult.deletedEdgeIds,
        );
        await fetch("/api/v1/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...rollbackPayload, delete: true }),
        });

        setBulkPasteResult({
          kind: "error",
          message: `${importRes.status} ${JSON.stringify(importBody.errors ?? importBody)}`,
        });
      } else {
        setBulkPasteResult({
          kind: "ok",
          data: importBody,
          warnings: diffResult.warnings,
        });
        setBulkPasteText("");
      }
    } catch (e) {
      const error = e as DiffPasteError;
      if (error.code === "duplicate_activity_name") {
        setBulkPasteResult({
          kind: "error",
          message: `Duplicate activity name: "${error.details as string}"`,
        });
      } else {
        setBulkPasteResult({ kind: "error", message: String((e as Error).message) });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!formData.name || !formData.domainId) {
      setResult({ kind: "error", message: "Name and domain are required" });
      return;
    }

    setBusy(true);
    setResult({ kind: "idle" });

    const journeyId = uuidv7();
    const importPayload = {
      nodes: [
        {
          id: journeyId,
          label: "UserJourney",
          name: formData.name,
          description: formData.description,
          attributes: {},
        },
      ],
      edges: [
        {
          id: uuidv7(),
          type: "PART_OF",
          from: journeyId,
          to: formData.domainId,
        },
      ],
    };

    try {
      const res = await fetch("/api/v1/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(importPayload),
      });
      const body = (await res.json()) as ImportResult;
      if (!res.ok) {
        setResult({
          kind: "error",
          message: `${res.status} ${JSON.stringify(body.errors ?? body)}`,
        });
      } else {
        setResult({ kind: "ok", data: body });
        setFormData({ name: "", description: "", domainId: "" });
        setIsModalOpen(false);
      }
    } catch (e) {
      setResult({ kind: "error", message: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ViewHeader
        title="Add journey"
        lede="Create a new UserJourney under a Domain. Uses POST /api/v1/import with client-side UUIDv7 generation (FR-15)."
      />
      <div className={styles.layout}>
        <Card>
          <Button tone="primary" onClick={() => setIsModalOpen(true)}>
            + New Journey
          </Button>
        </Card>

        {result.kind === "ok" && (
          <Card title="Import result">
            <KeyValueList
              rows={[
                { label: "Nodes created", value: String(result.data.nodes.length) },
                { label: "Edges created", value: String(result.data.edges.length) },
                {
                  label: "Journey ID",
                  value: <code className={styles.id}>{result.data.nodes[0]?.id}</code>,
                },
              ]}
            />
            {result.data.errors.length > 0 && (
              <div className={styles.err}>
                <strong>Errors:</strong>
                <pre>{JSON.stringify(result.data.errors, null, 2)}</pre>
              </div>
            )}
          </Card>
        )}

        {result.kind === "error" && (
          <Card title="Error">
            <pre className={styles.err}>{result.message}</pre>
          </Card>
        )}

        {/* T-13a: Bulk paste section */}
        <Card title="Bulk paste activities">
          <SecLabel>Journey *</SecLabel>
          {journeys.status === "loading" && <p>Loading journeys…</p>}
          {journeys.status === "ok" && (
            <select
              className={styles.input}
              value={bulkPasteJourneyId}
              onChange={(e) => setBulkPasteJourneyId(e.currentTarget.value)}
              required
            >
              <option value="">Select a journey…</option>
              {(journeys.data.rows ?? []).map((j) => ({ id: String((j as Record<string, unknown>).id ?? ""), name: String((j as Record<string, unknown>).name ?? "") })).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          )}

          <SecLabel>Activity names (one per line)</SecLabel>
          <textarea
            className={styles.textarea}
            rows={8}
            value={bulkPasteText}
            onChange={(e) => setBulkPasteText(e.currentTarget.value)}
            placeholder="Verify Receipt&#10;Process Payment&#10;Ship Order"
          />

          <div className={styles.actions}>
            <Button
              tone="primary"
              onClick={() => void handleBulkPaste()}
              disabled={busy || !bulkPasteJourneyId || !bulkPasteText.trim()}
            >
              {busy ? "Processing…" : "Import Activities"}
            </Button>
            <Button
              tone="ghost"
              onClick={() => {
                setBulkPasteText("");
                setBulkPasteJourneyId("");
                setBulkPasteResult({ kind: "idle" });
              }}
              type="button"
            >
              Clear
            </Button>
          </div>

          {bulkPasteResult.kind === "ok" && (
            <>
              <KeyValueList
                rows={[
                  { label: "Nodes created/reused", value: String(bulkPasteResult.data.nodes.length) },
                  { label: "Edges created", value: String(bulkPasteResult.data.edges.length) },
                ]}
              />
              {bulkPasteResult.warnings.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <strong>Warnings:</strong>
                  <ul>
                    {bulkPasteResult.warnings.map((w, i) => (
                      <li key={i} style={{ color: "var(--warn)" }}>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {bulkPasteResult.data.errors.length > 0 && (
                <div className={styles.err}>
                  <strong>Errors:</strong>
                  <pre>{JSON.stringify(bulkPasteResult.data.errors, null, 2)}</pre>
                </div>
              )}
            </>
          )}

          {bulkPasteResult.kind === "error" && (
            <pre className={styles.err}>{bulkPasteResult.message}</pre>
          )}
        </Card>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="New Journey"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <SecLabel>Domain *</SecLabel>
          {domains.status === "loading" && <p>Loading domains…</p>}
          {domains.status === "error" && <p className={styles.err}>Error loading domains</p>}
          {domains.status === "ok" && (
            <select
              className={styles.input}
              value={formData.domainId}
              onChange={(e) => setFormData({ ...formData, domainId: e.currentTarget.value })}
              required
            >
              <option value="">Select a domain…</option>
              {(domains.data.rows ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <SecLabel>Journey name *</SecLabel>
          <input
            className={styles.input}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
            placeholder="e.g. Order to Cash"
            required
          />

          <SecLabel>Description</SecLabel>
          <textarea
            className={styles.textarea}
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.currentTarget.value })}
            placeholder="Short description of this journey"
          />

          <div className={styles.actions}>
            <Button
              type="submit"
              tone="primary"
              onClick={() => void handleSubmit()}
              disabled={busy || !formData.name || !formData.domainId}
            >
              {busy ? "Creating…" : "Create Journey"}
            </Button>
            <Button tone="ghost" onClick={() => setIsModalOpen(false)} type="button">
              Cancel
            </Button>
          </div>

          {result.kind === "error" && (
            <pre className={styles.err}>{result.message}</pre>
          )}
        </form>
      </Modal>
    </>
  );
}