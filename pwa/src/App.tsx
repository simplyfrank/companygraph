import { useEffect, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { SubNav } from "./components/SubNav";
import { Button } from "./components/Button";
import { AskTheGraph } from "./components/AskTheGraph";
import { SidePanel } from "./components/SidePanel";
import { ConnectivityBanner } from "./components/ConnectivityBanner";
import { useSchemaStore } from "./store/schemaStore";
import { api } from "./api";
import { useFetch } from "./useFetch";
import {
  SURFACES,
  parseHash,
  toHash,
  findSurface,
  type Route,
} from "./route";
import { renderView } from "./views";
import styles from "./App.module.css";

const POLL_INTERVAL_MS = 30_000;

// Architecture: environment label and ontology version are injected at
// build time via Vite env vars so staging/production show correct values.
// Set VITE_ENV and VITE_ONTOLOGY_VERSION in the relevant .env.* file.
// Falls back to "dev" / "v?" when the var is absent (local dev default).
const APP_ENV = (import.meta.env.VITE_ENV as string | undefined) ?? "dev";
const ONTOLOGY_VERSION = (import.meta.env.VITE_ONTOLOGY_VERSION as string | undefined) ?? "v?";

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  // T-17: Non-blocking schema hydration (triggers fetch, doesn't block render).
  const schemaRefresh = useSchemaStore((s) => s.refresh);
  useEffect(() => { void schemaRefresh(); }, [schemaRefresh]);

  // Hash-driven routing.
  useEffect(() => {
    const onHash = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) {
      window.location.hash = toHash(route);
    }
    return () => window.removeEventListener("hashchange", onHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Health + stats polling for the TopBar.
  const [health, setHealth] = useState<{ ok: boolean; version?: string }>({ ok: false });
  const stats = useFetch(() => api.stats(), [route.surface, route.tab]);
  useEffect(() => {
    let stop = false;
    const poll = async (): Promise<void> => {
      try {
        const h = await api.healthz();
        if (!stop) setHealth({ ok: h.ok, version: h.neo4j.version });
      } catch {
        if (!stop) setHealth({ ok: false });
      }
    };
    poll();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, POLL_INTERVAL_MS);
    return () => { stop = true; clearInterval(id); };
  }, []);

  // Global keyboard shortcuts: Alt+1..8 to jump surfaces, "/" to focus
  // the SubNav search input. Guarded against firing while typing in any
  // input/textarea/contenteditable.
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing = tag === "input" || tag === "textarea" || target?.isContentEditable;

      // Alt+digit jumps surfaces (works even when typing).
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const s = SURFACES[idx];
        if (s) {
          e.preventDefault();
          window.location.hash = toHash({ surface: s.id, tab: s.tabs[0].id });
        }
        return;
      }

      // "/" focuses search (skip while typing).
      if (!typing && e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Esc blurs.
      if (e.key === "Escape") {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const surface = findSurface(route.surface) ?? SURFACES[0];
  const totalNodes = stats.status === "ok"
    ? Object.values(stats.data.nodes).reduce((a, b) => a + b, 0)
    : undefined;
  const totalEdges = stats.status === "ok"
    ? Object.values(stats.data.edges).reduce((a, b) => a + b, 0)
    : undefined;

  return (
    <div className={styles.app}>
      <TopBar
        brand="companygraph"
        env={APP_ENV}
        surfaces={SURFACES.map((s) => ({ id: s.id, label: s.label, kbd: s.kbd, href: toHash({ surface: s.id, tab: s.tabs[0].id }) }))}
        activeSurface={surface.id}
        healthy={health.ok}
        nodeCount={totalNodes}
        edgeCount={totalEdges}
        ontologyVersion={ONTOLOGY_VERSION}
        user={{ name: "Operator", initials: "OP" }}
      />
      {!health.ok && <ConnectivityBanner />}
      <main className={styles.main}>
        <SubNav
          crumbs={[{ label: surface.label }]}
          tabs={surface.tabs}
          activeTab={route.tab}
          onTab={(t) => { window.location.hash = toHash({ surface: surface.id, tab: t }); }}
          search={{ placeholder: `Search ${surface.label}`, shortcut: "/" }}
          searchInputRef={searchInputRef}
          actions={<Button tone="ghost" onClick={() => location.reload()}>Reload</Button>}
        />
        <section className={styles.view} data-testid="stat-counts" data-nodes={totalNodes} data-edges={totalEdges}>
          {renderView(route)}
        </section>
      </main>
      <SidePanel />
      {/* Surface-aware: don't show inside the Chat surface itself. */}
      {surface.id !== "chat" && (
        <AskTheGraph currentRouteHash={window.location.hash} />
      )}
    </div>
  );
}
