import { mkdtempSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";

export interface CapturedRequest {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: Buffer;
}

export interface Target {
  url: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** A local HTTP endpoint that records every request (method, headers, raw body). */
export async function startTarget(handler?: Handler): Promise<Target> {
  const requests: CapturedRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      requests.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks),
      });
      const respond =
        handler ??
        ((_req, r) => {
          r.writeHead(200, { "content-type": "application/json" });
          r.end(JSON.stringify({ ok: true }));
        });
      respond(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface RunShape {
  id: string;
  status: string;
  attempts?: Array<{
    id: string;
    seq: number;
    status: string;
    httpStatus: number | null;
    durationMs: number | null;
    responsePreview: string | null;
    error: string | null;
  }>;
}

/** Poll a run until it leaves the active states (or the deadline passes). */
export async function waitForRun(app: FastifyInstance, id: string): Promise<RunShape> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const response = await app.inject({ method: "GET", url: `/api/runs/${id}` });
    const run = response.json() as RunShape;
    if (run.status !== "pending" && run.status !== "running") {
      return run;
    }
    if (Date.now() > deadline) {
      throw new Error(`run ${id} did not settle; last status ${run.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export async function createEvent(
  app: FastifyInstance,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({ method: "POST", url: "/api/events", payload: body });
  return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
}

export async function createRun(
  app: FastifyInstance,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({ method: "POST", url: "/api/runs", payload: body });
  return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
}

export function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "hooklab-test-")), "hooklab.db");
}
