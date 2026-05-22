import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";

interface OpenApiDoc {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, { description?: string }>>;
}

const METHOD_TONE: Record<string, "accent" | "good" | "warn" | "danger" | "neutral"> = {
  get: "accent",
  post: "good",
  put: "warn",
  patch: "warn",
  delete: "danger",
};

export function ApiEndpoints() {
  const doc = useFetch(() => api.openapi() as Promise<OpenApiDoc>, []);

  return (
    <>
      <ViewHeader
        title="OpenAPI endpoints"
        lede="Live registry of /api/v1/* served at GET /api/v1/openapi.json. Generated at server boot from the zod schemas in shared/."
      />
      <Card title={doc.status === "ok" ? `${doc.data.info?.title} · OpenAPI ${doc.data.openapi}` : "OpenAPI"}>
        {doc.status === "loading" && <Loading what="OpenAPI" />}
        {doc.status === "error" && <ErrorState message={doc.error} />}
        {doc.status === "ok" && doc.data.paths && (
          <DataTable
            columns={[
              { id: "method", label: "method", kind: "text" },
              { id: "path",   label: "path", kind: "id" },
              { id: "desc",   label: "description", kind: "text" },
            ]}
            rows={Object.entries(doc.data.paths).flatMap(([path, methods]) =>
              Object.entries(methods).map(([method, info]) => ({
                method: <Pill tone={METHOD_TONE[method] ?? "neutral"}>{method.toUpperCase()}</Pill>,
                path,
                desc: info.description ?? "",
              })),
            )}
          />
        )}
      </Card>
    </>
  );
}
