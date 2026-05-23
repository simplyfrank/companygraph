// T-18: Service Worker (FR-27 / AC-20)
//
// Hand-rolled service worker with three cache strategies:
// 1. Shell precache (install-time) — index.html, JS/CSS bundles, manifest
// 2. Schema cache (network-first) — /api/v1/schema
// 3. Reads cache (network-first, ~5 MB LRU) — all GET /api/v1/* endpoints
//
// Writes (POST/PATCH/DELETE) are NEVER cached.
// Cache version is bumped on each deploy (keyed by SW file hash).

const CACHE_VERSION = "1";
const SHELL_CACHE = `companygraph-shell-v${CACHE_VERSION}`;
const SCHEMA_CACHE = `companygraph-schema-v${CACHE_VERSION}`;
const READS_CACHE = `companygraph-reads-v${CACHE_VERSION}`;

// Shell assets to precache on install. The build step injects actual
// hashed filenames; these are the logical paths that Vite always serves.
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
];

// Maximum size for the reads cache (approximate, in entries).
const READS_CACHE_MAX_ENTRIES = 200;

// --- Install: precache shell assets ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn("[sw] precache failed (non-fatal):", err);
      }),
    ),
  );
  // Activate immediately without waiting for existing tabs to close.
  self.skipWaiting();
});

// --- Activate: clean up old caches ---
self.addEventListener("activate", (event) => {
  const current = [SHELL_CACHE, SCHEMA_CACHE, READS_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("companygraph-") && !current.includes(k))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  // Take control of all open tabs immediately.
  self.clients.claim();
});

// --- Fetch: routing strategy ---
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache writes (POST, PATCH, DELETE, PUT).
  if (request.method !== "GET") return;

  // Schema endpoint: network-first with dedicated cache.
  if (url.pathname === "/api/v1/schema") {
    event.respondWith(networkFirst(request, SCHEMA_CACHE));
    return;
  }

  // API read endpoints: network-first with LRU reads cache.
  if (url.pathname.startsWith("/api/v1/")) {
    event.respondWith(networkFirst(request, READS_CACHE));
    return;
  }

  // Shell assets: cache-first (fast boot), fall back to network.
  event.respondWith(cacheFirst(request, SHELL_CACHE));
});

// --- Message handler: invalidate caches on schema change ---
self.addEventListener("message", (event) => {
  if (event.data?.type === "invalidate-reads") {
    caches.delete(READS_CACHE);
    caches.delete(SCHEMA_CACHE);
  }
});

// --- Strategy: network-first ---
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      // LRU eviction for reads cache
      if (cacheName === READS_CACHE) {
        evictLRU(cacheName, READS_CACHE_MAX_ENTRIES);
      }
    }
    return response;
  } catch {
    // Network failed — try cache.
    const cached = await caches.match(request);
    if (cached) {
      // Mark response as from cache so the app can show stale banner.
      const headers = new Headers(cached.headers);
      headers.set("x-sw-cache", "true");
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    // Nothing in cache either — return network error.
    return new Response("Service Unavailable", { status: 503 });
  }
}

// --- Strategy: cache-first ---
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Service Unavailable", { status: 503 });
  }
}

// --- LRU eviction (approximate) ---
async function evictLRU(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    // Delete oldest entries (first in = oldest).
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map((k) => cache.delete(k)));
  }
}
