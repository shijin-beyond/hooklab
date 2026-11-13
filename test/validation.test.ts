import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { LIMITS } from "../src/limits.js";
import { buildApp } from "../src/app.js";
import { createEvent, createRun } from "./helpers.js";

describe("input validation", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ dbPath: ":memory:", webDistDir: "/nonexistent" });
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects non-JSON payloads", async () => {
    for (const payload of ["{not json", "42", '"just a string"', ""]) {
      const res = await createEvent(app, { payload });
      expect(res.statusCode).toBe(400);
    }
  });

  it("rejects payloads over the size limit", async () => {
    const payload = `{"data":"${"x".repeat(LIMITS.maxPayloadBytes)}"}`;
    const res = await createEvent(app, { payload });
    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toContain("exceeds");
  });

  it("rejects transport-controlled headers", async () => {
    for (const name of ["content-length", "Host", "Connection", "transfer-encoding"]) {
      const res = await createEvent(app, {
        payload: "{}",
        headers: { [name]: "1" },
      });
      expect(res.statusCode).toBe(400);
      expect(String(res.body.error)).toContain("transport-controlled");
    }
  });

  it("rejects malformed header values and too many headers", async () => {
    const newline = await createEvent(app, {
      payload: "{}",
      headers: { "x-bad": "line1\nline2" },
    });
    expect(newline.statusCode).toBe(400);

    const tooMany = Object.fromEntries(
      Array.from({ length: LIMITS.maxHeaders + 1 }, (_, i) => [`x-h-${i}`, "v"]),
    );
    const res = await createEvent(app, { payload: "{}", headers: tooMany });
    expect(res.statusCode).toBe(400);
  });

  it("rejects non-http(s) target URLs", async () => {
    const event = await createEvent(app, { payload: "{}" });
    const eventId = event.body.id as string;
    for (const targetUrl of ["file:///etc/passwd", "ftp://x", "not a url", "ws://127.0.0.1"]) {
      const res = await createRun(app, {
        eventId,
        targetUrl,
        deliveries: 1,
        intervalMs: 0,
        timeoutMs: 1000,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it("enforces delivery, interval, and timeout bounds", async () => {
    const event = await createEvent(app, { payload: "{}" });
    const eventId = event.body.id as string;
    const cases = [
      { deliveries: 0 },
      { deliveries: LIMITS.maxDeliveries + 1 },
      { deliveries: 1.5 },
      { intervalMs: -1 },
      { intervalMs: LIMITS.maxIntervalMs + 1 },
      { timeoutMs: LIMITS.minTimeoutMs - 1 },
      { timeoutMs: LIMITS.maxTimeoutMs + 1 },
    ];
    for (const extra of cases) {
      const res = await createRun(app, {
        eventId,
        targetUrl: "http://127.0.0.1:1/hook",
        deliveries: 1,
        intervalMs: 0,
        timeoutMs: 1000,
        ...extra,
      });
      expect(res.statusCode).toBe(400);
    }
  });
});
