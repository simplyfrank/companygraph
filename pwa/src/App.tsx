import { useEffect, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { SubNav } from "./components/SubNav";
import { Button } from "./components/Button";
import { FloatingChat } from "./components/FloatingChat";
import { SidePanel } from "./components/SidePanel";
import { ConnectivityBanner } from "./components/ConnectivityBanner";
import { SchemaBootstrap } from "./components/SchemaBootstrap";
import { useHealthStore, startHealthPolling } from "./data/health";
import {
  SURFACES,
  parseHash,
  toHash,
  findSurface,
  type Route,
} from "./route";
import { renderView } from "./views";
import styles from "./App.module.css";

const APP_ENV = (import.meta.env.VITE_ENV as string | undefined) ?? "dev";
const ONTOLOGY_VERSION = (import.meta.env.VITE_ONTOLOGY_VERSION as string | undefined) ?? "v?";

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

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

  // Lifted health + stats polling (T-07 / T-17).
  useEffect(() => startHealthPolling(), []);
  const health = useHealthStore((s) => s.connected);
  const stats = useHealthStore((s) => s.stats);

  // Global keyboard shortcuts: Alt+1..8 to jump surfaces, "/" to focus
  // the SubNav search input. Guarded against firing while typing in any
  // input/textarea/contenteditable.
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing = tag === "input" || tag === "textarea" || target?.isContentEditable;

      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const s = SURFACES[idx];
        if (s) {
          e.preventDefault();
          window.location.hash = toHash({ surface: s.id, tab: s.tabs[0]!.id });
        }
        return;
      }

      if (!typing && e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (e.key === "Escape") {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const surface = findSurface(route.surface) ?? SURFACES[0]!;
  const totalNodes = stats?.nodes ?? 0;
  const totalEdges = stats?.edges ?? 0;

  return (
    <SchemaBootstrap>
      <div className={styles.app}>
        <TopBar
          brand="companygraph"
          env={APP_ENV}
          surfaces={SURFACES.map((s) => ({ id: s.id, label: s.label, kbd: s.kbd, href: toHash({ surface: s.id, tab: s.tabs[0]!.id }) }))}
          activeSurface={surface.id}
          healthy={health}
          nodeCount={totalNodes}
          edgeCount={totalEdges}
          ontologyVersion={ONTOLOGY_VERSION}
          user={{ name: "Operator", initials: "OP" }}
        />
        <ConnectivityBanner />
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
          <section className={styles.view} data-testid="stat-counts" data-nodes={totalNodes ?? ""} data-edges={totalEdges ?? ""}>
            {renderView(route)}
          </section>
        </main>
        <SidePanel />
        {surface.id !== "chat" && (
          <FloatingChat />
        )}
      </div>
    </SchemaBootstrap>
  );
}
