import { useEffect, useState } from "react";
import { TopBar } from "./components/TopBar";
import { SubNav } from "./components/SubNav";
import { Button } from "./components/Button";
import { FloatingChat } from "./components/FloatingChat";
import { SidePanel } from "./components/SidePanel";
import { SchemaBootstrap } from "./components/SchemaBootstrap";
import { SearchPalette } from "./components/SearchPalette";
import { useHealthStore, startHealthPolling } from "./data/health";
import {
  SURFACES,
  parseHash,
  toHash,
  findSurface,
  type Route,
} from "./route";
import { renderView } from "./views";
import { ActiveModelProvider } from "./context/ActiveModelContext";
import { useTitleStore } from "./store/titleStore";
import { usePrefStore } from "./store/prefStore";
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

  // Lifted stats polling (T-07 / T-17).
  useEffect(() => startHealthPolling(), []);
  const stats = useHealthStore((s) => s.stats);

  // Global keyboard shortcuts: Alt+1..8 to jump surfaces (index-derived).
  // SearchPalette handles "/" (open) and Escape (close) internally;
  // Cmd/Ctrl+K also opens the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey && /^[1-8]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const s = SURFACES[idx];
        if (s) {
          e.preventDefault();
          // Restore last-visited tab for this surface if any.
          const last = usePrefStore.getState().getLastTab(s.id);
          const tab = last?.tab ?? s.tabs[0]!.id;
          const entityId = last?.entityId;
          window.location.hash = toHash({ surface: s.id, tab, entityId });
        }
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Persist last-visited tab on route change (FR-18 / AC-19).
  useEffect(() => {
    usePrefStore.getState().setLastTab(route.surface, route.tab, route.entityId);
  }, [route.surface, route.tab, route.entityId]);

  const surface = findSurface(route.surface) ?? SURFACES[0]!;
  const totalNodes = stats?.nodes ?? 0;
  const totalEdges = stats?.edges ?? 0;

  // Breadcrumb computation (design §4.7 / AC-15).
  const titles = useTitleStore((s) => s.titles);
  const tab = surface.tabs.find((t) => t.id === route.tab);
  const entityName = route.entityId ? titles[route.entityId] ?? route.entityId : undefined;
  const crumbs = [
    { label: surface.label, href: toHash({ surface: surface.id, tab: surface.tabs[0]!.id }) },
    { label: tab?.label ?? route.tab, href: toHash({ surface: surface.id, tab: route.tab }) },
    ...(entityName ? [{ label: entityName }] : []),
  ];

  return (
    <SchemaBootstrap>
      <div className={styles.app}>
        <TopBar
          brand="companygraph"
          env={APP_ENV}
          surfaces={SURFACES}
          activeSurface={surface.id}
          nodeCount={totalNodes}
          edgeCount={totalEdges}
          ontologyVersion={ONTOLOGY_VERSION}
          user={{ name: "Operator", initials: "OP" }}
          onSurface={(id) => {
            const s = findSurface(id);
            if (!s) return;
            const last = usePrefStore.getState().getLastTab(id);
            const tab = last?.tab ?? s.tabs[0]!.id;
            const entityId = last?.entityId;
            window.location.hash = toHash({ surface: id, tab, entityId });
          }}
        />
        <main className={styles.main}>
          <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
            {crumbs.map((c, i) => (
              <span key={i} className={styles.crumb}>
                {c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <span className={styles.crumbSep}> / </span>}
              </span>
            ))}
          </nav>
          <SubNav
            tabs={surface.tabs}
            groups={surface.groups}
            activeTab={route.tab}
            onTab={(t) => { window.location.hash = toHash({ surface: surface.id, tab: t }); }}
            actions={
              <Button tone="ghost" onClick={() => location.reload()}>Reload</Button>
            }
          />
          <section className={styles.view} data-testid="stat-counts" data-nodes={totalNodes ?? ""} data-edges={totalEdges ?? ""}>
            {/* model-workspace-core T-18: active-model context is a
                shell-level concern — mounted above renderView so every
                Model view + sibling tab can consume it (FR-15). */}
            <ActiveModelProvider>
              {renderView(route)}
            </ActiveModelProvider>
          </section>
        </main>
        <SidePanel />
        {surface.id !== "chat" && (
          <FloatingChat />
        )}
        <SearchPalette />
      </div>
    </SchemaBootstrap>
  );
}
