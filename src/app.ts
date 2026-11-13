import { existsSync } from "node:fs";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { openDb, type AttemptRow, type EventRow, type RunRow } from "./db.js";
import { executeRun } from "./delivery.js";
import { LIMITS } from "./limits.js";
import { ApiError, validateEventInput, validateRunInput } from "./validation.js";

export interface AppOptions {
  /** SQLite file path, or ":memory:" for tests. */
  dbPath: string;
  /** Directory containing the built dashboard; skipped when absent. */
  webDistDir?: string;
}

const defaultWebDist = resolve(dirname(fileURLToPath(import.meta.url)), "../web/dist");

function serializeEvent(row: EventRow, includePayload: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    createdAt: row.created_at,
    contentType: row.content_type,
    sizeBytes: row.payload.byteLength,
    headers: JSON.parse(row.headers),
  };
  if (includePayload) {
    base.payload = Buffer.from(row.payload).toString("utf8");
  }
  return base;
}

function serializeRun(row: RunRow, attempts?: AttemptRow[]): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    createdAt: row.created_at,
    eventId: row.event_id,
    targetUrl: row.target_url,
    deliveries: row.deliveries,
    intervalMs: row.interval_ms,
    timeoutMs: row.timeout_ms,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
  if (attempts !== undefined) {
    base.attempts = attempts.map(serializeAttempt);
  }
  return base;
}

function serializeAttempt(row: AttemptRow): Record<string, unknown> {
  return {
    id: row.id,
    seq: row.seq,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    httpStatus: row.http_status,
    responsePreview: row.response_preview,
    error: row.error,
  };
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const db = openDb(options.dbPath);
  const webDist = options.webDistDir ?? defaultWebDist;

  const app = Fastify({
    bodyLimit: LIMITS.requestBodyLimitBytes,
    logger: false,
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    // Fastify's own errors (e.g. body-limit, malformed JSON) keep their status.
    const fastifyError = error as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof fastifyError.statusCode === "number" ? fastifyError.statusCode : 500;
    const message = statusCode === 500 ? "internal error" : String(fastifyError.message ?? "error");
    return reply.status(statusCode).send({ error: message });
  });

  app.addHook("onClose", () => {
    db.close();
  });

  app.get("/api/health", () => ({ ok: true }));

  app.post("/api/events", (request, reply) => {
    const input = validateEventInput(request.body);
    const id = randomUUID();
    db.prepare(
      "INSERT INTO events (id, created_at, content_type, headers, payload) VALUES (?, ?, ?, ?, ?)",
    ).run(
      id,
      new Date().toISOString(),
      input.contentType,
      JSON.stringify(input.headers),
      input.payload,
    );
    return reply.status(201).send({ id });
  });

  app.get("/api/events", () => {
    const rows = db
      .prepare("SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT 200")
      .all() as unknown as EventRow[];
    return rows.map((row) => serializeEvent(row, false));
  });

  app.get<{ Params: { id: string } }>("/api/events/:id", (request, reply) => {
    const row = db
      .prepare("SELECT * FROM events WHERE id = ?")
      .get(request.params.id) as unknown as EventRow | undefined;
    if (row === undefined) {
      return reply.status(404).send({ error: "event not found" });
    }
    return serializeEvent(row, true);
  });

  app.post("/api/runs", (request, reply) => {
    const input = validateRunInput(request.body);
    const event = db.prepare("SELECT id FROM events WHERE id = ?").get(input.eventId);
    if (event === undefined) {
      return reply.status(404).send({ error: "event not found" });
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO runs (id, created_at, event_id, target_url, deliveries, interval_ms,
       timeout_ms, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    ).run(
      id,
      new Date().toISOString(),
      input.eventId,
      input.targetUrl,
      input.deliveries,
      input.intervalMs,
      input.timeoutMs,
    );
    // Delivery runs in-process, sequentially; on process exit mid-run the next
    // startup marks it 'interrupted' instead of resuming.
    void executeRun(db, id).catch(() => {});
    return reply.status(201).send({ id });
  });

  app.get("/api/runs", () => {
    const rows = db
      .prepare("SELECT * FROM runs ORDER BY created_at DESC, id DESC LIMIT 200")
      .all() as unknown as RunRow[];
    return rows.map((row) => serializeRun(row));
  });

  app.get<{ Params: { id: string } }>("/api/runs/:id", (request, reply) => {
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(request.params.id) as unknown as
      RunRow | undefined;
    if (row === undefined) {
      return reply.status(404).send({ error: "run not found" });
    }
    const attempts = db
      .prepare("SELECT * FROM attempts WHERE run_id = ? ORDER BY seq ASC")
      .all(row.id) as unknown as AttemptRow[];
    return serializeRun(row, attempts);
  });

  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.status(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
