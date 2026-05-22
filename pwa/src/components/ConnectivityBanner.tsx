import { useHealthStore } from "../data/health";

// Renders a tiny status row showing the API connection state + node/edge
// counts. Subscribed to `useHealthStore` so every route observes the
// same truth (AC-29). Visually compact — designed to live in the shell
// header (T-23 will mount this in App.tsx).

export interface ConnectivityBannerProps {
  className?: string;
}

export function ConnectivityBanner({ className }: ConnectivityBannerProps) {
  const connected = useHealthStore((s) => s.connected);
  const stats = useHealthStore((s) => s.stats);
  const lastPolledAt = useHealthStore((s) => s.lastPolledAt);

  const dotColor = connected ? "#1abc54" : "#d33";
  const label = connected ? "Connected" : "Disconnected";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="connectivity-banner"
      data-connected={connected ? "true" : "false"}
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dotColor,
          display: "inline-block",
        }}
      />
      <span>{label}</span>
      {stats && (
        <span data-testid="stat-counts" style={{ opacity: 0.7 }}>
          • {stats.nodes} nodes • {stats.edges} edges
        </span>
      )}
      {!connected && lastPolledAt && (
        <span style={{ opacity: 0.5 }}>
          • last checked {Math.round((Date.now() - lastPolledAt) / 1000)}s ago
        </span>
      )}
    </div>
  );
}
