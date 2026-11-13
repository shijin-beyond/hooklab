import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createEvent, createRun, startTarget, waitForRun, type Target } from "./helpers.js";

describe("delivery", () => {
  let app: FastifyInstance;
  let target: Target;

  beforeEach(async () => {
    app = await buildApp({ dbPath: ":memory:", webDistDir: "/nonexistent" });
    target = await startTarget();
  });

  afterEach(async () => {
    await app.close();
    await target.close();
  });

  async function sendEvent(payload: string, run: Record<string, unknown>) {
    const event = await createEvent(app, { payload });
    expect(event.statusCode).toBe(201);
    const created = await createRun(app, {
      eventId: event.body.id,
      targetUrl: target.url,
      deliveries: 1,
      intervalMs: 0,
      timeoutMs: 5000,
      ...run,
    });
    expect(created.statusCode).toBe(201);
    return waitForRun(app, created.body.id as string);
  }

  it("sends one event once and records the outcome", async () => {
    const run = await sendEvent('{"hello":"world"}', {});
    expect(run.status).toBe("completed");
    expect(run.attempts).toHaveLength(1);
    const attempt = run.attempts![0]!;
    expect(attempt.status).toBe("delivered");
    expect(attempt.httpStatus).toBe(200);
    expect(attempt.durationMs).toBeGreaterThanOrEqual(0);
    expect(attempt.error).toBeNull();
    expect(target.requests).toHaveLength(1);
    expect(target.requests[0]!.body.toString("utf8")).toBe('{"hello":"world"}');
  });

  it("sends duplicates with distinct attempt IDs and preserved bytes", async () => {
    // Whitespace, unicode, and key order must survive — bytes are not reserialized.
    const payload = '{  "z": 1,\n "a": "héllo ✓", "b": [true, null]  }';
    const run = await sendEvent(payload, { deliveries: 3, intervalMs: 10 });
    expect(run.status).toBe("completed");
    expect(run.attempts).toHaveLength(3);

    const ids = new Set(run.attempts!.map((a) => a.id));
    expect(ids.size).toBe(3);
    expect(run.attempts!.map((a) => a.seq)).toEqual([0, 1, 2]);
    for (const attempt of run.attempts!) {
      expect(attempt.status).toBe("delivered");
    }
    // Every request carried the identical raw bytes of the same event.
    expect(target.requests).toHaveLength(3);
    for (const request of target.requests) {
      expect(request.body.equals(Buffer.from(payload, "utf8"))).toBe(true);
    }
  });

  it("records non-success HTTP responses as transport outcomes", async () => {
    const failing = await startTarget((_req, res) => {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("boom");
    });
    try {
      const event = await createEvent(app, { payload: "{}" });
      const created = await createRun(app, {
        eventId: event.body.id,
        targetUrl: failing.url,
        deliveries: 1,
        intervalMs: 0,
        timeoutMs: 5000,
      });
      const run = await waitForRun(app, created.body.id as string);
      const attempt = run.attempts![0]!;
      // A 500 is a transport-level answer, not a delivery failure.
      expect(attempt.status).toBe("delivered");
      expect(attempt.httpStatus).toBe(500);
      expect(attempt.responsePreview).toContain("boom");
      expect(attempt.error).toBeNull();
    } finally {
      await failing.close();
    }
  });

  it("records connection failures without marking the run crashed", async () => {
    const event = await createEvent(app, { payload: "{}" });
    const created = await createRun(app, {
      eventId: event.body.id,
      targetUrl: "http://127.0.0.1:1/hook", // nothing listens there
      deliveries: 1,
      intervalMs: 0,
      timeoutMs: 5000,
    });
    const run = await waitForRun(app, created.body.id as string);
    expect(run.status).toBe("completed");
    const attempt = run.attempts![0]!;
    expect(attempt.status).toBe("failed");
    expect(attempt.httpStatus).toBeNull();
    expect(attempt.error).toBeTruthy();
  });

  it("records timeouts when the target never responds", async () => {
    const hanging = await startTarget(() => {
      // never respond
    });
    try {
      const event = await createEvent(app, { payload: "{}" });
      const created = await createRun(app, {
        eventId: event.body.id,
        targetUrl: hanging.url,
        deliveries: 1,
        intervalMs: 0,
        timeoutMs: 200,
      });
      const run = await waitForRun(app, created.body.id as string);
      const attempt = run.attempts![0]!;
      expect(attempt.status).toBe("failed");
      expect(String(attempt.error)).toMatch(/timeout/i);
    } finally {
      await hanging.close();
    }
  });
});
