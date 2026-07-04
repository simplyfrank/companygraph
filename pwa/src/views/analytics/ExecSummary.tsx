import { useState } from "react";
import { Card } from "../../components/Card";
import { ViewHeader } from "../_shared";
import styles from "./ExecSummary.module.css";

// cto-analytics-reporting FR-08 / T-08 — executive-summary PDF launcher.
//
// This view renders NO PDF itself (it imports no PDF library). It hits the
// server endpoint GET /api/v1/analytics/exec-summary.pdf — which streams a
// byte-deterministic application/pdf — and hands the blob to the platform:
// the native share sheet via navigator.share when the browser supports
// sharing files (iOS "Save to Files"), otherwise an `<a download>` fallback.

const PDF_ENDPOINT = "/api/v1/analytics/exec-summary.pdf";

export function AnalyticsExecSummary() {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  async function download() {
    setState("working");
    try {
      const res = await fetch(PDF_ENDPOINT);
      if (!res.ok) throw new Error(`export failed (${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], "exec-summary.pdf", { type: "application/pdf" });

      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Executive summary" });
        } catch {
          // User dismissed the share sheet — not an error.
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "exec-summary.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <ViewHeader
        title="Executive summary"
        lede="Generate a portable PDF of the top journeys by complexity, consolidation candidates, and AI-leverage candidates — each carrying a graph-state hash so a reader can verify which snapshot it was drawn from. The PDF is produced on the server; nothing is rendered in the browser."
      />
      <Card>
        <button
          type="button"
          className={styles.download}
          onClick={download}
          disabled={state === "working"}
          data-testid="exec-summary-download"
        >
          {state === "working" ? "Preparing…" : "Download exec summary"}
        </button>
        {state === "error" && (
          <p className={styles.error} role="alert" data-testid="exec-summary-error">
            Could not generate the summary. Try again.
          </p>
        )}
      </Card>
    </>
  );
}
