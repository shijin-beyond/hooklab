import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Persistence via the built-in node:sqlite driver: no native dependency, and
 * the database file survives restarts so delivery history is durable.
 */

export interface EventRow {
  id: string;
  created_at: string;
  content_type: string;
  headers: string; // JSON object of user-supplied headers
  payload: Uint8Array; // raw request bytes, never reserialized (node:sqlite returns BLOBs as Uint8Array)
}

export interface RunRow {
  id: string;
  created_at: string;
  event_id: string;
  target_url: string;
  deliveries: number;
  interval_ms: number;
  timeout_ms: number;
  status: "pending" | "running" | "completed" | "interrupted" | "failed";
  started_at: string | null;
  finished_at: string | null;
}

export interface AttemptRow {
  id: string;
  run_id: string;
  seq: number;
  status: "sending" | "delivered" | "failed" | "interrupted";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  http_status: number | null;
  response_preview: string | null;
  error: string | null;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      content_type TEXT NOT NULL,
      headers TEXT NOT NULL DEFAULT '{}',
      payload BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id),
      target_url TEXT NOT NULL,
      deliveries INTEGER NOT NULL,
      interval_ms INTEGER NOT NULL,
      timeout_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      seq INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER,
      http_status INTEGER,
      response_preview TEXT,
      error TEXT
    );
  `);
}

/**
 * On open, runs that were mid-flight when the process last stopped are marked
 * 'interrupted' rather than resumed: an attempt that may already have reached
 * the target must never be silently resent.
 */
function markInterrupted(db: DatabaseSync): void {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE attempts SET status = 'interrupted', finished_at = ? WHERE status = 'sending'",
  ).run(now);
  db.prepare(
    "UPDATE runs SET status = 'interrupted', finished_at = ? WHERE status IN ('pending', 'running')",
  ).run(now);
}

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  markInterrupted(db);
  return db;
}
