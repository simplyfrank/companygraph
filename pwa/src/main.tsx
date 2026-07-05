import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/companygraph/index.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing in index.html");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// T-18: Service worker registration (FR-27 / AC-20).
// Production-only: the SW caches shell assets and API reads, which
// interferes with Vite HMR and bun --hot in dev mode. In dev we
// actively unregister any stale SW so changes are always visible.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] SW registration failed:", err);
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) reg.unregister();
    });
  }
}
