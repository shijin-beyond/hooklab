import { useCallback, useEffect, useState } from "react";
import { api, type EventSummary, type Run } from "./api";

const DEFAULT_EVENT = `{
  "id": "evt_demo_1",
  "type": "payment.succeeded",
  "data": { "amount": 1999, "currency": "usd" }
}`;

const ACTIVE_RUN_STATUSES = new Set(["pending", "running"]);

function formatTime(iso: string | null): string {
  if (iso === null) {
    return "—";
  }
  return new Date(iso).toLocaleTimeString();
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status status-${status}`}>{status}</span>;
}

export function App() {
  const [payload, setPayload] = useState(DEFAULT_EVENT);
  const [headersText, setHeadersText] = useState("");
  const [targetUrl, setTargetUrl] = useState("http://127.0.0.1:4040/hook");
  const [deliveries, setDeliveries] = useState(3);
  const [intervalMs, setIntervalMs] = useState(500);
  const [timeoutMs, setTimeoutMs] = useState(10_000);

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [currentRun, setCurrentRun] = useState<Run | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshHistory = useCallback(async () => {
    const [nextEvents, nextRuns] = await Promise.all([api.listEvents(), api.listRuns()]);
    setEvents(nextEvents);
    setRuns(nextRuns);
  }, []);

  useEffect(() => {
    refreshHistory().catch(() => setNotice("Could not reach the HookLab API — is the server up?"));
  }, [refreshHistory]);

  // Poll the active run until it settles.
  useEffect(() => {
    if (currentRun === null || !ACTIVE_RUN_STATUSES.has(currentRun.status)) {
      return;
    }
    const timer = setInterval(() => {
      api
        .getRun(currentRun.id)
        .then(setCurrentRun)
        .catch(() => {});
    }, 400);
    return () => clearInterval(timer);
  }, [currentRun]);

  // When the watched run settles, refresh history once.
  useEffect(() => {
    if (currentRun !== null && !ACTIVE_RUN_STATUSES.has(currentRun.status)) {
      refreshHistory().catch(() => {});
    }
  }, [currentRun, refreshHistory]);

  const openRun = (id: string) => {
    api
      .getRun(id)
      .then(setCurrentRun)
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
  };

  const loadEvent = (id: string) => {
    api
      .getEvent(id)
      .then((event) => {
        setPayload(event.payload);
        setHeadersText(
          Object.keys(event.headers).length > 0 ? JSON.stringify(event.headers, null, 2) : "",
        );
        setNotice(`Loaded event ${event.id} into the editor.`);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
  };

  const send = () => {
    setNotice(null);
    let parsedHeaders: Record<string, string> | undefined;
    if (headersText.trim().length > 0) {
      try {
        const parsed: unknown = JSON.parse(headersText);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setNotice('Headers must be a JSON object like {"x-key": "value"}.');
          return;
        }
        parsedHeaders = parsed as Record<string, string>;
      } catch {
        setNotice("Headers field is not valid JSON.");
        return;
      }
    }
    try {
      JSON.parse(payload);
    } catch {
      setNotice("Event payload is not valid JSON.");
      return;
    }
    setBusy(true);
    (async () => {
      const event = await api.createEvent({ payload, headers: parsedHeaders });
      const run = await api.createRun({
        eventId: event.id,
        targetUrl,
        deliveries,
        intervalMs,
        timeoutMs,
      });
      setCurrentRun(await api.getRun(run.id));
      await refreshHistory();
    })()
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false));
  };

  return (
    <main>
      <header>
        <h1>HookLab</h1>
        <p>Reproduce duplicate webhook deliveries against a local endpoint.</p>
      </header>

      {notice !== null && <div className="notice">{notice}</div>}

      <div className="layout">
        <section className="card">
          <h2>1. Event</h2>
          <label>
            JSON payload (sent as-is, bytes preserved)
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={10}
              spellCheck={false}
            />
          </label>
          <label>
            Headers (optional JSON object; transport-controlled headers are rejected)
            <textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              rows={3}
              placeholder='{"x-custom-header": "value"}'
              spellCheck={false}
            />
          </label>

          <h2>2. Delivery</h2>
          <label>
            Target webhook URL
            <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
          </label>
          <div className="grid3">
            <label>
              Deliveries
              <input
                type="number"
                min={1}
                max={20}
                value={deliveries}
                onChange={(e) => setDeliveries(Number(e.target.value))}
              />
            </label>
            <label>
              Interval (ms)
              <input
                type="number"
                min={0}
                max={60_000}
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
              />
            </label>
            <label>
              Timeout (ms)
              <input
                type="number"
                min={100}
                max={30_000}
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
              />
            </label>
          </div>
          <button onClick={send} disabled={busy}>
            {busy ? "Sending…" : "Send"}
          </button>
          <p className="hint">
            {deliveries > 1
              ? `Sends the same event ${deliveries} times, ${intervalMs}ms apart — duplicates reuse the event identity.`
              : "Sends the event once."}
          </p>
        </section>

        <section className="card">
          <h2>Attempts{currentRun !== null ? ` — run ${currentRun.id.slice(0, 8)}` : ""}</h2>
          {currentRun === null ? (
            <p className="hint">Send an event or open a run from history.</p>
          ) : (
            <>
              <p className="hint">
                Target <code>{currentRun.targetUrl}</code> —{" "}
                <StatusBadge status={currentRun.status} />
              </p>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>HTTP</th>
                    <th>Duration</th>
                    <th>Response / error</th>
                  </tr>
                </thead>
                <tbody>
                  {(currentRun.attempts ?? []).map((attempt) => (
                    <tr key={attempt.id}>
                      <td>{attempt.seq + 1}</td>
                      <td>
                        <StatusBadge status={attempt.status} />
                      </td>
                      <td>{attempt.httpStatus ?? "—"}</td>
                      <td>{attempt.durationMs !== null ? `${attempt.durationMs}ms` : "—"}</td>
                      <td>
                        <code className="preview">
                          {attempt.error ?? attempt.responsePreview ?? "—"}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h2>History</h2>
          <h3>Runs</h3>
          <ul className="history">
            {runs.map((run) => (
              <li key={run.id}>
                <button className="link" onClick={() => openRun(run.id)}>
                  {formatTime(run.createdAt)} — {run.deliveries}× → {run.targetUrl}
                </button>{" "}
                <StatusBadge status={run.status} />
              </li>
            ))}
            {runs.length === 0 && <li className="hint">No runs yet.</li>}
          </ul>
          <h3>Events</h3>
          <ul className="history">
            {events.map((event) => (
              <li key={event.id}>
                <button className="link" onClick={() => loadEvent(event.id)}>
                  {formatTime(event.createdAt)} — {event.sizeBytes}B {event.contentType}
                </button>
              </li>
            ))}
            {events.length === 0 && <li className="hint">No events yet.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
