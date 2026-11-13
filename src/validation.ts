import { Buffer } from "node:buffer";
import { FORBIDDEN_HEADERS, LIMITS } from "./limits.js";

export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

export interface EventInput {
  payload: Buffer;
  contentType: string;
  headers: Record<string, string>;
}

export interface RunInput {
  eventId: string;
  targetUrl: string;
  deliveries: number;
  intervalMs: number;
  timeoutMs: number;
}

function badRequest(message: string): ApiError {
  return new ApiError(400, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw badRequest(`${field} must be an integer`);
  }
  if (value < min || value > max) {
    throw badRequest(`${field} must be between ${min} and ${max}`);
  }
  return value;
}

// RFC 9110 token: valid HTTP field name characters.
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function validateHeaders(value: unknown): Record<string, string> {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    throw badRequest("headers must be an object of name/value string pairs");
  }
  const entries = Object.entries(value);
  if (entries.length > LIMITS.maxHeaders) {
    throw badRequest(`headers allows at most ${LIMITS.maxHeaders} entries`);
  }
  const headers: Record<string, string> = {};
  for (const [name, raw] of entries) {
    if (Buffer.byteLength(name) > LIMITS.maxHeaderNameBytes || !HEADER_NAME_RE.test(name)) {
      throw badRequest(`invalid header name: ${name.slice(0, 64)}`);
    }
    if (FORBIDDEN_HEADERS.has(name.toLowerCase())) {
      throw badRequest(`header "${name}" is transport-controlled and cannot be set`);
    }
    if (typeof raw !== "string") {
      throw badRequest(`header "${name}" value must be a string`);
    }
    if (raw.includes("\r") || raw.includes("\n")) {
      throw badRequest(`header "${name}" value must not contain line breaks`);
    }
    if (Buffer.byteLength(raw) > LIMITS.maxHeaderValueBytes) {
      throw badRequest(`header "${name}" value exceeds ${LIMITS.maxHeaderValueBytes} bytes`);
    }
    headers[name] = raw;
  }
  return headers;
}

export function validateEventInput(body: unknown): EventInput {
  if (!isRecord(body)) {
    throw badRequest("request body must be a JSON object");
  }
  if (typeof body.payload !== "string" || body.payload.length === 0) {
    throw badRequest("payload must be a non-empty JSON string");
  }
  const payload = Buffer.from(body.payload, "utf8");
  if (payload.byteLength > LIMITS.maxPayloadBytes) {
    throw badRequest(`payload exceeds ${LIMITS.maxPayloadBytes} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.payload);
  } catch {
    throw badRequest("payload must be valid JSON");
  }
  if (!isRecord(parsed)) {
    throw badRequest("payload must be a JSON object");
  }

  let contentType = "application/json";
  if (body.contentType !== undefined) {
    if (typeof body.contentType !== "string" || Buffer.byteLength(body.contentType) > 128) {
      throw badRequest("contentType must be a string of at most 128 bytes");
    }
    contentType = body.contentType;
  }

  return { payload, contentType, headers: validateHeaders(body.headers) };
}

export function validateRunInput(body: unknown): RunInput {
  if (!isRecord(body)) {
    throw badRequest("request body must be a JSON object");
  }
  if (typeof body.eventId !== "string" || body.eventId.length === 0) {
    throw badRequest("eventId is required");
  }
  if (typeof body.targetUrl !== "string") {
    throw badRequest("targetUrl is required");
  }
  let targetUrl: URL;
  try {
    targetUrl = new URL(body.targetUrl);
  } catch {
    throw badRequest("targetUrl is not a valid URL");
  }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    throw badRequest("targetUrl must use http or https");
  }
  return {
    eventId: body.eventId,
    targetUrl: targetUrl.toString(),
    deliveries: requireInteger(body.deliveries ?? 1, "deliveries", 1, LIMITS.maxDeliveries),
    intervalMs: requireInteger(
      body.intervalMs ?? 0,
      "intervalMs",
      LIMITS.minIntervalMs,
      LIMITS.maxIntervalMs,
    ),
    timeoutMs: requireInteger(
      body.timeoutMs ?? 10_000,
      "timeoutMs",
      LIMITS.minTimeoutMs,
      LIMITS.maxTimeoutMs,
    ),
  };
}
