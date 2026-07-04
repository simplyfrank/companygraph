import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AnalyticsExecSummary } from "../views/analytics/ExecSummary";

// cto-analytics-reporting T-08 / AC-R2 — the exec-summary launcher hits the
// server PDF endpoint and triggers a download; it renders no PDF itself.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis.URL as unknown as Record<string, unknown>).createObjectURL;
  delete (globalThis.URL as unknown as Record<string, unknown>).revokeObjectURL;
});

describe("AnalyticsExecSummary launcher (AC-R2)", () => {
  it("clicking Download fetches /api/v1/analytics/exec-summary.pdf and triggers an <a download>", async () => {
    const pdfBlob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: "application/pdf" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(pdfBlob, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    // jsdom has no navigator.canShare → the <a download> fallback runs.
    const createURL = vi.fn(() => "blob:mock");
    const revokeURL = vi.fn();
    // jsdom's URL has no object-URL helpers — define them for this test.
    Object.defineProperty(URL, "createObjectURL", { value: createURL, configurable: true, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeURL, configurable: true, writable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<AnalyticsExecSummary />);
    fireEvent.click(screen.getByTestId("exec-summary-download"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/analytics/exec-summary.pdf"));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createURL).toHaveBeenCalled();
  });

  it("imports no PDF-rendering library (server owns PDF generation)", () => {
    // vitest runs from the pwa package root.
    const src = readFileSync(resolve(process.cwd(), "src/views/analytics/ExecSummary.tsx"), "utf8");
    expect(src).not.toMatch(/from\s+["'][^"']*(pdfkit|@react-pdf|jspdf|pdf-lib)/);
  });
});
