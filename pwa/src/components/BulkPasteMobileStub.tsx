// T-13b: iPhone Safari "open on desktop" stub view
//
// Per design §4.13 (OC-04): on phone-class viewports, the bulk paste
// area shows a stub with a "Copy URL" button so users can open the journey
// on desktop where the bulk paste UI is usable.

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { ViewHeader } from "../views/_shared";

interface BulkPasteMobileStubProps {
  journeyId: string;
  journeyName: string;
}

export function BulkPasteMobileStub({ journeyId, journeyName }: BulkPasteMobileStubProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/sme/add?journey=${encodeURIComponent(journeyId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy URL:", err);
    }
  };

  useEffect(() => {
    // Detect if we're on a mobile device
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (!isMobile) {
      // If not mobile, this component shouldn't render
      // But the parent should handle this logic
    }
  }, []);

  return (
    <Card title="Bulk paste">
      <ViewHeader
        title="Desktop required"
        lede="Bulk paste is optimized for desktop. Open this journey on a desktop browser to use the full bulk paste interface."
      />
      <div style={{ padding: "16px", textAlign: "center" }}>
        <p style={{ marginBottom: "16px", color: "var(--muted)" }}>
          You're viewing this on a mobile device. The bulk paste feature requires a larger screen.
        </p>
        <Button tone="primary" onClick={handleCopyUrl}>
          {copied ? "URL copied!" : "Copy URL to open on desktop"}
        </Button>
      </div>
    </Card>
  );
}