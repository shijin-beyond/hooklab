import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { LIMITS } from "./limits.js";
import type { EventRow, RunRow } from "./db.js";

/**
 * Executes a run: `deliveries` sequential POSTs of the stored event payload
 * bytes to the target URL, separated by `intervalMs`. Attempts are never
 * retried automatically, and the same event identity is reused — only attempt
 * IDs differ, which is what makes a handler's dedup logic testable.
 */

interface AttemptOutcome {
  status: "delivered" | "failed";
  httpStatus: number | null;
  responsePreview: string | null;
  error: string | null;
  durationMs: number;
}

async function readPreview(body: ReadableStream<Uint8Array> | null): Promise<string | null> {
  if (body === null) {
    return null;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < LIMITS.maxResponsePreviewBytes) {
      const { done, value } = await reader.read();
      if (done || value === undefined) {
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, LIMITS.maxResponsePreviewBytes).toString("utf8");
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "TimeoutError" ? `timeout: ${error.message}` : error.message;
  }
  return String(error);
}

async function sendAttempt(event: EventRow, run: RunRow): Promise<AttemptOutcome> {
  const start = performance.now();
  try {
    // Buffer body: the stored bytes are sent verbatim, never reserialized.
    const response = await fetch(run.target_url, {
      method: "POST",
      headers: { "content-type": event.content_type, ...JSON.parse(event.headers) },
      body: new Uint8Array(event.payload),
      redirect: "manual",
      signal: AbortSignal.timeout(run.timeout_ms),
    });
    const responsePreview = await readPreview(response.body);
    return {
      status: "delivered",
      httpStatus: response.status,
      responsePreview,
      error: null,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      status: "failed",
      httpStatus: null,
      responsePreview: null,
      error: describeError(error),
      durationMs: Math.round(performance.now() - start),
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function executeRun(db: DatabaseSync, runId: string): Promise<void> {
  return (async () => {
    const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as unknown as
      RunRow | undefined;
    if (run === undefined) {
      throw new Error(`run not found: ${runId}`);
    }
    const event = db.prepare("SELECT * FROM events WHERE id = ?").get(run.event_id) as unknown as
      EventRow | undefined;
    if (event === undefined) {
      throw new Error(`event not found: ${run.event_id}`);
    }

    db.prepare("UPDATE runs SET status = 'running', started_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      runId,
    );

    const insertAttempt = db.prepare(
      `INSERT INTO attempts (id, run_id, seq, status, started_at)
       VALUES (?, ?, ?, 'sending', ?)`,
    );
    const finishAttempt = db.prepare(
      `UPDATE attempts SET status = ?, finished_at = ?, duration_ms = ?, http_status = ?,
       response_preview = ?, error = ? WHERE id = ?`,
    );

    for (let seq = 0; seq < run.deliveries; seq += 1) {
      const attemptId = randomUUID();
      insertAttempt.run(attemptId, runId, seq, new Date().toISOString());
      const outcome = await sendAttempt(event, run);
      finishAttempt.run(
        outcome.status,
        new Date().toISOString(),
        outcome.durationMs,
        outcome.httpStatus,
        outcome.responsePreview,
        outcome.error,
        attemptId,
      );
      if (seq + 1 < run.deliveries && run.interval_ms > 0) {
        await delay(run.interval_ms);
      }
    }

    db.prepare("UPDATE runs SET status = 'completed', finished_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      runId,
    );
  })().catch((error: unknown) => {
    // Execution itself crashed (not a delivery failure): mark the run failed
    // rather than leaving it 'running' to be misread as interrupted later.
    db.prepare("UPDATE runs SET status = 'failed', finished_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      runId,
    );
    throw error;
  });
}
