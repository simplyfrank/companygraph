// T-19 integration tests — Server-Sent Events at GET /api/v1/ontology/events.
//
// Sub-cases (design §5.4, post-pass-1 B-02):
//
//   1. Basic subscribe + live event — open an SSE connection; create a
//      probe node-label; assert a `data: {event_id…}` frame arrives.
//   2. Last-Event-ID replay — capture the first event's id, close, open a
//      new connection with `Last-Event-ID: <id>` set; trigger a SECOND
//      mutation; assert the second event arrives. (The first does NOT
//      replay because the ts-based query filters with `> sinceTs`.)
//   3. `?since=<ISO>` parameter — pre-create two events with known
//      timestamps; open a connection with `?since=<earlier_ts>`; assert
//      both events replay through the stream.
//   4. Heartbeat — open a connection; wait > `ONTOLOGY_SSE_HEARTBEAT_MS`;
//      assert at least one `: keepalive` comment line arrives. Gated
//      behind `RUN_SSE_HEARTBEAT_TEST=1` because the default heartbeat
//      is 30 s. When the env var is set, the operator is expected to
//      have ALSO restarted the api server with a short
//      `ONTOLOGY_SSE_HEARTBEAT_MS=2000` so the test completes in seconds.
//   5. Subscribe-before-replay race window (B-02 (b)) — static grep
//      against the handler source: assert that `ontologyEvents.on(...)`
//      is registered BEFORE the `MATCH (e:_OntologyEvent)` replay
//      query, so events committed during the replay are buffered
//      rather than dropped.
//
// All tests prefix `integration:` so `bun test:integration` picks them
// up. The API server must be running on `127.0.0.1:8787` (override via
// `API_BASE_URL`) and Neo4j must be reachable.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";

const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

interface SseEvent {
  eventId: string;
  data: Record<string, unknown>;
}

interface OntologyEventPayload {
  event_id: string;
  version_id: string;
  ts: string;
  diff: ReadonlyArray<Record<string, unknown>>;
}

// Random suffix for parallel-safe label names.
function uniqueSuffix(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
}

function probeLabelPayload(name: string): Record<string, unknown> {
  return {
    name,
    description: `probe label ${name} for SSE test`,
    usage_example: `An instance of ${name}`,
    json_schema_doc: { type: "object", additionalProperties: true },
  };
}

async function createProbeLabel(name: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/ontology/node-labels`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(probeLabelPayload(name)),
  });
  if (res.status !== 201) {
    const text = await res.text();
    throw new Error(`probe label creation failed (${res.status}): ${text}`);
  }
}

async function cleanupLabel(name: string): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(`MATCH (n:\`${name}\`) DETACH DELETE n`);
    await session.run(
      `MATCH (l:_OntologyNodeLabel {name: $name})
       OPTIONAL MATCH (l)<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
       OPTIONAL MATCH (l)<-[:ALIGNS]-(a:_OntologyAlignment)
       DETACH DELETE l, s, a`,
      { name },
    );
    await session.run(`DROP CONSTRAINT node_id_unique_${name} IF EXISTS`);
    await session.run(`DROP INDEX node_name_${name} IF EXISTS`);
  } finally {
    await session.close();
  }
}

// Open an SSE connection and stream events as they arrive. The
// `counters` object is mutated by the background reader loop so the
// caller can poll it without races.
interface SseCounters {
  keepaliveLines: number;
}

interface SseHandle {
  events: SseEvent[];
  counters: SseCounters;
  done: Promise<void>;
  cancel: () => Promise<void>;
}

async function openSse(
  url: string,
  headers: Record<string, string> = {},
  abortController?: AbortController,
): Promise<{ res: Response; handle: SseHandle }> {
  const ac = abortController ?? new AbortController();
  const res = await fetch(url, {
    headers: { Accept: "text/event-stream", ...headers },
    signal: ac.signal,
  });
  if (!res.body) throw new Error("SSE response has no body");
  const events: SseEvent[] = [];
  const counters: SseCounters = { keepaliveLines: 0 };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  const done = (async () => {
    try {
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += dec.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          if (block.length === 0) continue;
          // Heartbeats arrive as `: keepalive` (SSE comment lines).
          const lines = block.split("\n");
          let eventId = "";
          let dataLine = "";
          let hasComment = false;
          for (const l of lines) {
            if (l.startsWith(":")) {
              hasComment = true;
            } else if (l.startsWith("id: ")) {
              eventId = l.slice(4);
            } else if (l.startsWith("data: ")) {
              dataLine = l.slice(6);
            }
          }
          if (dataLine) {
            try {
              const data = JSON.parse(dataLine) as Record<string, unknown>;
              events.push({ eventId, data });
            } catch {
              // ignore malformed frames
            }
          } else if (hasComment) {
            counters.keepaliveLines += 1;
          }
        }
      }
    } catch {
      // reader cancelled or aborted — expected during teardown.
    }
  })();

  const handle: SseHandle = {
    events,
    counters,
    done,
    cancel: async () => {
      ac.abort();
      try {
        await reader.cancel();
      } catch {
        // already cancelled
      }
      await done;
    },
  };
  return { res, handle };
}

async function waitFor(
  cond: () => boolean,
  timeoutMs: number,
  pollMs = 25,
): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return cond();
}

describe("integration: T-19 SSE /api/v1/ontology/events", () => {
  const createdLabels: string[] = [];

  beforeAll(async () => {
    // Confirm the server is reachable; loud failure beats a 5 s timeout.
    const probe = await fetch(`${BASE_URL}/api/v1/healthz`);
    expect(probe.status).toBe(200);
  });

  afterAll(async () => {
    for (const name of createdLabels) {
      try {
        await cleanupLabel(name);
      } catch {
        // best-effort
      }
    }
    await closeDriver();
    _resetDriver();
  });

  test("1. basic subscribe + live event delivery", async () => {
    const labelName = `SseProbeA${uniqueSuffix()}`;
    createdLabels.push(labelName);

    const { handle } = await openSse(`${BASE_URL}/api/v1/ontology/events`);

    // Give the server a beat to register the listener BEFORE the mutation.
    // Without this the test still passes (the live buffer drain catches
    // events during start()) but the timing is more predictable.
    await new Promise((r) => setTimeout(r, 100));

    await createProbeLabel(labelName);

    const got = await waitFor(() => handle.events.length >= 1, 5_000);
    expect(got).toBe(true);
    expect(handle.events.length).toBeGreaterThanOrEqual(1);

    const evt = handle.events[handle.events.length - 1]!;
    const payload = evt.data as unknown as OntologyEventPayload;
    expect(typeof payload.event_id).toBe("string");
    expect(payload.event_id.length).toBeGreaterThan(0);
    expect(evt.eventId).toBe(payload.event_id);
    expect(Array.isArray(payload.diff)).toBe(true);

    await handle.cancel();
  });

  test("2. Last-Event-ID replay — second mutation arrives, first does not", async () => {
    const labelOne = `SseProbeB1${uniqueSuffix()}`;
    const labelTwo = `SseProbeB2${uniqueSuffix()}`;
    createdLabels.push(labelOne, labelTwo);

    // First connection — receive event #1 and capture its event_id.
    const { handle: h1 } = await openSse(`${BASE_URL}/api/v1/ontology/events`);
    await new Promise((r) => setTimeout(r, 100));
    await createProbeLabel(labelOne);
    const got1 = await waitFor(() => h1.events.length >= 1, 5_000);
    expect(got1).toBe(true);
    const firstEventId = h1.events[h1.events.length - 1]!.eventId;
    expect(firstEventId.length).toBeGreaterThan(0);
    await h1.cancel();

    // Second connection with Last-Event-ID set to event #1's id.
    const { handle: h2 } = await openSse(`${BASE_URL}/api/v1/ontology/events`, {
      "Last-Event-ID": firstEventId,
    });
    await new Promise((r) => setTimeout(r, 100));

    // Trigger event #2.
    await createProbeLabel(labelTwo);

    const got2 = await waitFor(() => h2.events.length >= 1, 5_000);
    expect(got2).toBe(true);

    // The second event MUST be present; the first MUST NOT replay
    // (ts-based query filters with `> sinceTs`).
    const seenIds = h2.events.map((e) => e.eventId);
    expect(seenIds).not.toContain(firstEventId);
    expect(h2.events.length).toBeGreaterThanOrEqual(1);

    await h2.cancel();
  });

  test("3. ?since=<ISO> parameter replays prior events", async () => {
    const labelA = `SseProbeC1${uniqueSuffix()}`;
    const labelB = `SseProbeC2${uniqueSuffix()}`;
    createdLabels.push(labelA, labelB);

    // Capture a `since` timestamp BEFORE either mutation.
    const sinceTs = new Date(Date.now() - 1).toISOString();

    // Pre-create two events; no SSE connection yet.
    await createProbeLabel(labelA);
    await createProbeLabel(labelB);

    // Now open a connection with ?since=<sinceTs>. Both events should
    // replay from `_OntologyEvent` via the ts-indexed query.
    const sinceUrl = `${BASE_URL}/api/v1/ontology/events?since=${encodeURIComponent(sinceTs)}`;
    const { handle } = await openSse(sinceUrl);

    const got = await waitFor(() => handle.events.length >= 2, 5_000);
    expect(got).toBe(true);
    expect(handle.events.length).toBeGreaterThanOrEqual(2);

    // The events MUST arrive in ts-ascending order (ORDER BY e.ts ASC).
    const tss = handle.events.map((e) => (e.data as unknown as OntologyEventPayload).ts);
    for (let i = 1; i < tss.length; i += 1) {
      expect(tss[i]! >= tss[i - 1]!).toBe(true);
    }

    await handle.cancel();
  });

  // Heartbeat — opt-in. Default heartbeat interval is 30 s; this test
  // would block the suite for that long. Gate behind RUN_SSE_HEARTBEAT_TEST=1
  // and assume the api server has been launched with a shorter
  // ONTOLOGY_SSE_HEARTBEAT_MS (e.g. 2000) so the assertion completes in
  // < 10 s.
  const heartbeatGate = process.env.RUN_SSE_HEARTBEAT_TEST === "1";
  test.if(heartbeatGate)(
    "4. heartbeat — `: keepalive` arrives within window",
    async () => {
      const hbIntervalMs = Number.parseInt(
        process.env.ONTOLOGY_SSE_HEARTBEAT_MS ?? "30000",
        10,
      );
      const waitMs = Math.min(hbIntervalMs * 2 + 1_000, 65_000);

      const { handle } = await openSse(`${BASE_URL}/api/v1/ontology/events`);
      const ok = await waitFor(
        () => handle.counters.keepaliveLines >= 1,
        waitMs,
        100,
      );
      expect(ok).toBe(true);
      await handle.cancel();
    },
    Math.max(70_000, (Number.parseInt(process.env.ONTOLOGY_SSE_HEARTBEAT_MS ?? "30000", 10) * 2) + 5_000),
  );

  test("5. subscribe-before-replay — source-grep verifies B-02 (b) fix", async () => {
    const source = readFileSync(
      resolve(import.meta.dir, "..", "src", "routes", "ontology-events.ts"),
      "utf8",
    );

    // Both literals must exist.
    const onIdx = source.indexOf(`ontologyEvents.on("ontology.changed"`);
    const replayIdx = source.indexOf(`MATCH (e:_OntologyEvent`);

    expect(onIdx).toBeGreaterThanOrEqual(0);
    expect(replayIdx).toBeGreaterThanOrEqual(0);
    // Subscribe MUST come first in source order (pass-1 B-02 (b) fix).
    expect(onIdx).toBeLessThan(replayIdx);

    // And the source must contain the live-buffer flush + replayDone flag.
    expect(source).toContain("liveBuffer");
    expect(source).toContain("replayDone");
    expect(source).toContain("seenIds");
  });
});
