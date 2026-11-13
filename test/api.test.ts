import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createEvent, createRun, startTarget, type Target } from "./helpers.js";

describe("api", () => {
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

  it("answers the health check", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("stores an event and returns it with the raw payload", async () => {
    const payload = '{  "a": 1,  "b": [1,2,3] }';
    const created = await createEvent(app, {
      payload,
      headers: { "x-custom": "yes" },
    });
    expect(created.statusCode).toBe(201);
    const id = created.body.id as string;
    expect(id).toBeTruthy();

    const detail = await app.inject({ method: "GET", url: `/api/events/${id}` });
    const event = detail.json() as { payload: string; headers: Record<string, string> };
    expect(event.payload).toBe(payload);
    expect(event.headers).toEqual({ "x-custom": "yes" });

    const list = await app.inject({ method: "GET", url: "/api/events" });
    const events = list.json() as Array<{ id: string; sizeBytes: number }>;
    expect(events.map((e) => e.id)).toContain(id);
    // List entries do not leak the payload body.
    expect(events[0]).not.toHaveProperty("payload");
  });

  it("returns 404 for unknown events and runs", async () => {
    expect((await app.inject({ method: "GET", url: "/api/events/nope" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/runs/nope" })).statusCode).toBe(404);
    const missing = await createRun(app, {
      eventId: "nope",
      targetUrl: target.url,
      deliveries: 1,
      intervalMs: 0,
      timeoutMs: 1000,
    });
    expect(missing.statusCode).toBe(404);
  });
});
