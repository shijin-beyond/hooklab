import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { createEvent, createRun, startTarget, tempDbPath, waitForRun } from "./helpers.js";

describe("persistence", () => {
  let apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps = [];
  });

  it("keeps events and run history across restarts", async () => {
    const dbPath = tempDbPath();
    const target = await startTarget();
    try {
      const app1 = await buildApp({ dbPath, webDistDir: "/nonexistent" });
      apps.push(app1);
      const event = await createEvent(app1, { payload: '{"persist":true}' });
      const run = await createRun(app1, {
        eventId: event.body.id,
        targetUrl: target.url,
        deliveries: 2,
        intervalMs: 0,
        timeoutMs: 5000,
      });
      await waitForRun(app1, run.body.id as string);
      await app1.close();
      apps = [];

      const app2 = await buildApp({ dbPath, webDistDir: "/nonexistent" });
      apps.push(app2);
      const events = (await app2.inject({ method: "GET", url: "/api/events" })).json() as Array<{
        id: string;
      }>;
      expect(events.map((e) => e.id)).toContain(event.body.id);

      const runs = (await app2.inject({ method: "GET", url: "/api/runs" })).json() as Array<{
        id: string;
        status: string;
      }>;
      const found = runs.find((r) => r.id === run.body.id);
      expect(found?.status).toBe("completed");

      const detail = (
        await app2.inject({ method: "GET", url: `/api/runs/${run.body.id}` })
      ).json() as {
        attempts: Array<{ status: string }>;
      };
      expect(detail.attempts).toHaveLength(2);
    } finally {
      await target.close();
    }
  });

  it("marks in-flight runs and attempts interrupted on restart, without resending", async () => {
    const dbPath = tempDbPath();
    const target = await startTarget();
    try {
      // Simulate a process killed mid-run: write the rows directly.
      const db = openDb(dbPath);
      db.prepare(
        "INSERT INTO events (id, created_at, content_type, headers, payload) VALUES ('evt1', '2026-01-01T00:00:00Z', 'application/json', '{}', ?)",
      ).run(Buffer.from("{}", "utf8"));
      db.prepare(
        `INSERT INTO runs (id, created_at, event_id, target_url, deliveries, interval_ms, timeout_ms, status, started_at)
         VALUES ('run1', '2026-01-01T00:00:01Z', 'evt1', ?, 5, 0, 5000, 'running', '2026-01-01T00:00:01Z')`,
      ).run(target.url);
      db.prepare(
        "INSERT INTO attempts (id, run_id, seq, status, started_at) VALUES ('att1', 'run1', 0, 'sending', '2026-01-01T00:00:02Z')",
      ).run();
      db.close();

      const dbCheck = new DatabaseSync(dbPath);
      const app = await buildApp({ dbPath, webDistDir: "/nonexistent" });
      apps.push(app);
      dbCheck.close();

      const run = (await app.inject({ method: "GET", url: "/api/runs/run1" })).json() as {
        status: string;
        attempts: Array<{ status: string }>;
      };
      expect(run.status).toBe("interrupted");
      expect(run.attempts[0]!.status).toBe("interrupted");

      // Nothing was resent: the receiver saw zero requests.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(target.requests).toHaveLength(0);
    } finally {
      await target.close();
    }
  });
});
