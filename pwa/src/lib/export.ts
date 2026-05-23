// Canvas export utilities per design §4.10 (FR-13).
//
// Uses html-to-image for both PNG (1× + 2×) and SVG export.
// Filenames use slugified titles + ISO date (YYYY-MM-DD) so they're
// filesystem-safe and sortable.

import { toPng, toSvg } from "html-to-image";
import { slugify } from "./slugify";

export interface ExportOptions {
  /** DOM element to capture (must be a React ref or DOM node). */
  element: HTMLElement;
  /** Base filename (slugified automatically). */
  filename: string;
  /** Pixel ratio for PNG exports (default 1 for 1×, pass 2 for 2×). */
  pixelRatio?: number;
  /** Export format. */
  format: "png" | "svg";
}

/**
 * Export a DOM element as PNG or SVG.
 * Returns a Blob that can be downloaded or saved.
 */
export async function exportCanvas(opts: ExportOptions): Promise<Blob> {
  const { element, filename, pixelRatio = 1, format } = opts;

  if (format === "png") {
    const dataUrl = await toPng(element, {
      pixelRatio,
      quality: 0.95,
      cacheBust: true,
    });
    return dataUrlToBlob(dataUrl);
  }

  // SVG export
  const dataUrl = await toSvg(element, {
    cacheBust: true,
  });
  return dataUrlToBlob(dataUrl);
}

/**
 * Generate a filesystem-safe filename with ISO date suffix.
 * Example: "order-to-cash-2026-05-23.png"
 */
export function exportFilename(base: string, format: "png" | "svg"): string {
  const slug = slugify(base);
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return `${slug}-${date}.${format}`;
}

/**
 * Helper: convert data URL to Blob.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header?.match(/:(.*?);/)?.[1] ?? "image/png";
  const bin = atob(base64 ?? "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}

/**
 * Trigger a browser download for a Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}