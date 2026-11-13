/**
 * Hard bounds for accepted input and captured output. Every value here is a
 * deliberate ceiling, not a suggestion — increase only with a documented reason.
 */
export const LIMITS = {
  /** Max event payload size accepted by POST /api/events. */
  maxPayloadBytes: 256 * 1024,
  /** Max bytes of a target's response body stored per attempt. */
  maxResponsePreviewBytes: 8 * 1024,
  /** Max deliveries in one run (first send + duplicates). */
  maxDeliveries: 20,
  minIntervalMs: 0,
  maxIntervalMs: 60_000,
  minTimeoutMs: 100,
  maxTimeoutMs: 30_000,
  maxHeaders: 20,
  maxHeaderNameBytes: 128,
  maxHeaderValueBytes: 2048,
  /** Fastify body limit; comfortably above maxPayloadBytes + envelope. */
  requestBodyLimitBytes: 320 * 1024,
  /** Max age a run may sit in 'running' before shutdown (documentation bound). */
} as const;

/** Header names users may not set: transport framing is owned by the HTTP client. */
export const FORBIDDEN_HEADERS: ReadonlySet<string> = new Set([
  "connection",
  "content-length",
  "date",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "via",
]);
