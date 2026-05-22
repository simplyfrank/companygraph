// T-19 — Server-Sent Events endpoint for the ontology change channel
// (design §5.4, post-pass-1 B-02 fix).
//
// Surface: `GET /api/v1/ontology/events` → `text/event-stream`.
//
// Pass-1 B-02 fixed two bugs in revision 1:
//   (a) The replay query was lexicographic on `event_id` (UUIDv7 STRING
//       under a UNIQUE constraint, not guaranteed to hit a range-index in
//       Neo4j 5 Community). The fix is to key the replay on the
//       `_onto_event_ts` range-index over `_OntologyEvent.ts`. The
//       `Last-Event-ID` HTTP header is resolved to a `ts` via the UNIQUE
//       index on `event_id` first, then the range scan runs on `ts`.
//   (b) The handler subscribed to the in-process EventEmitter AFTER
//       running the replay query, which dropped any event committed
//       between the read and the `.on()` call. The fix is to subscribe
//       BEFORE the replay, buffer live events into an array during the
//       replay window, then drain the buffer with `event_id`-dedupe.
//
// Heartbeat: every 30 s a `: keepalive` comment line is enqueued
// (NFR-09 + the `X-Accel-Buffering: no` response header so reverse
// proxies that buffer SSE — Render / Fly / Vercel / nginx — flush
// immediately). The interval is read from the
// `ONTOLOGY_SSE_HEARTBEAT_MS` env var so the integration test can dial
// it down for the heartbeat assertion without waiting 30 seconds.
//
// Lifecycle: `req.signal.abort` (client disconnect) tears down the
// heartbeat interval, detaches the EventEmitter listener, and closes
// the ReadableStream controller. No managed transaction here — the
// handler only runs ONE read (the replay scan) and otherwise tails the
// EventEmitter.

import type { OntologyChangedEvent } from "@companygraph/shared";
import { getDriver } from "../neo4j/driver";
import { ontologyEvents } from "../ontology/events";

function heartbeatIntervalMs(): number {
  const raw = process.env.ONTOLOGY_SSE_HEARTBEAT_MS;
  if (!raw) return 30_000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 30_000;
}

export async function handleOntologyEvents(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lastEventId = req.headers.get("Last-Event-ID");
  const sinceParam = url.searchParams.get("since");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (frame: string): void => {
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          // Controller already closed (client disconnected mid-write).
        }
      };

      // Emit an immediate `: connected` comment so the response headers
      // flush to the client without waiting for the first event. Bun's
      // fetch resolves the `await fetch()` promise on first chunk; an
      // initial no-op chunk lets the caller proceed to trigger
      // mutations. The line is a valid SSE comment per the spec
      // (`field-name == ""` → ignored by the EventSource consumer).
      enqueue(`: connected\n\n`);

      // === Pass-1 B-02 fix (b): subscribe BEFORE replay; buffer live events during replay. ===
      const liveBuffer: OntologyChangedEvent[] = [];
      let replayDone = false;
      const seenIds = new Set<string>();

      const listener = (evt: OntologyChangedEvent): void => {
        if (replayDone) {
          if (seenIds.has(evt.event_id)) return;
          enqueue(`id: ${evt.event_id}\ndata: ${JSON.stringify(evt)}\n\n`);
          seenIds.add(evt.event_id);
        } else {
          liveBuffer.push(evt);
        }
      };
      ontologyEvents.on("ontology.changed", listener);

      try {
        // === Pass-1 B-02 fix (a): query keyed on `ts` (indexed via _onto_event_ts), not event_id. ===
        // Resolve Last-Event-ID → ts via UNIQUE index on event_id first; fall back to ?since=<ISO>.
        let sinceTs: string | null = sinceParam;
        if (!sinceTs && lastEventId) {
          const driver = getDriver();
          const lookupSession = driver.session();
          try {
            const r = await lookupSession.executeRead((tx) =>
              tx.run(
                `MATCH (e:_OntologyEvent {event_id: $id}) RETURN e.ts AS ts`,
                { id: lastEventId },
              ),
            );
            const ts = r.records[0]?.get("ts") as string | undefined;
            sinceTs = ts ?? null;
            // If the event aged out of the 5-min retention buffer (T-20),
            // sinceTs stays null → no replay possible. Client receives only
            // live events from here on.
          } finally {
            await lookupSession.close();
          }
        }

        if (sinceTs) {
          const replay = await replayEventsSinceTs(sinceTs);
          for (const evt of replay) {
            if (seenIds.has(evt.event_id)) continue;
            enqueue(`id: ${evt.event_id}\ndata: ${JSON.stringify(evt)}\n\n`);
            seenIds.add(evt.event_id);
          }
        }

        // Drain the live-buffer (events that fired DURING replay).
        for (const evt of liveBuffer) {
          if (seenIds.has(evt.event_id)) continue;
          enqueue(`id: ${evt.event_id}\ndata: ${JSON.stringify(evt)}\n\n`);
          seenIds.add(evt.event_id);
        }
      } finally {
        replayDone = true; // future events flow straight through the listener
      }

      // Heartbeat (NFR-09). Interval configurable via env for tests.
      const hb = setInterval(() => enqueue(`: keepalive\n\n`), heartbeatIntervalMs());

      // Clean up on disconnect.
      const onAbort = (): void => {
        clearInterval(hb);
        ontologyEvents.off("ontology.changed", listener);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      if (req.signal.aborted) {
        onAbort();
      } else {
        req.signal.addEventListener("abort", onAbort, { once: true });
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // `X-Accel-Buffering: no` is nginx-specific (pass-1 N-05). Harmless
      // without nginx; documented because Render / Fly / Vercel DO buffer
      // SSE responses without it.
      "X-Accel-Buffering": "no",
    },
  });
}

async function replayEventsSinceTs(sinceTs: string): Promise<OntologyChangedEvent[]> {
  // Index-backed range query — `_onto_event_ts` (created in §3.2 via
  // `applyMetaSchema`). Ordered ASC so subscribers observe events in
  // their committed order.
  const driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `MATCH (e:_OntologyEvent)
         WHERE e.ts > $sinceTs
         RETURN e
         ORDER BY e.ts ASC`,
        { sinceTs },
      ),
    );
    return result.records.map((r) => {
      const e = r.get("e") as {
        properties: {
          event_id: string;
          version_id: string;
          ts: string;
          diff_jsonpatch: string;
        };
      };
      const diffRaw = e.properties.diff_jsonpatch ?? "[]";
      let diff: ReadonlyArray<Record<string, unknown>>;
      try {
        const parsed = JSON.parse(diffRaw) as unknown;
        diff = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
      } catch {
        diff = [];
      }
      return {
        event_id: e.properties.event_id,
        version_id: e.properties.version_id,
        ts: e.properties.ts,
        diff,
      };
    });
  } finally {
    await session.close();
  }
}
