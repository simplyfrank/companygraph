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
// Graceful failure: Safari private mode, quota exhaustion, and user
// denial all cause register() to reject — the app proceeds without
// offline support. AC-20 verifies degradation.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("[pwa] SW registration failed:", err);
  });
}
