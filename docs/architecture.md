# Architecture decisions

Short, dated records of decisions that would be expensive to reverse or confusing to
rediscover. Newest first.

## 2026-11-13 — Vertical slice: Fastify + node:sqlite + React/Vite

- Backend: Fastify 5, serving both `/api/*` and the built dashboard
  (`@fastify/static`). Chosen for a small, explicit HTTP surface.
- Persistence: `node:sqlite` (built into Node >= 22.13) — durable local history with
  zero native or external dependencies.
- Frontend: React 19 + Vite 8 in `web/`; in production the server serves `web/dist`,
  in development Vite proxies `/api` to the server.
- Scheduling is in-process and sequential. Runs are never resumed: `openDb` marks
  `pending`/`running` runs and `sending` attempts `interrupted` on startup, because
  an attempt that may already have reached the target must not be resent. A
  database-backed scheduler is only needed when we add resumable schedules.
- Delivery: one `fetch` per attempt with `redirect: "manual"`, `AbortSignal.timeout`
  for timeouts, and a streaming read capped at `maxResponsePreviewBytes`. The event
  payload is stored as a `BLOB` and sent as raw bytes; headers are validated against
  a forbidden set (host, content-length, connection, …) at write time.
- Three tables — `events`, `runs`, `attempts` — map the model separation; duplicates
  are new attempts on the same event, never new events.

## 2026-11-13 — Language, runtime, and module system

HookLab is written in TypeScript (strict mode, including `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`) targeting Node.js >= 20, published as native ESM
(`module: NodeNext`). Rationale: the initial audience is Node.js developers; strict
checking catches input-validation and error-handling mistakes early; ESM matches the
current Node.js ecosystem.

## 2026-11-13 — Toolchain

- Package manager: npm with a committed `package-lock.json`; installs use `npm ci`.
- Tests: Vitest, for TS-native support and controllable fake timers.
- Linting: ESLint 9 flat config with `typescript-eslint` strict; Prettier for
  formatting, with `eslint-config-prettier` to avoid rule conflicts.

## 2026-11-13 — Core model separation

The domain keeps three concepts distinct (to be implemented in the delivery engine):

- **Webhook event** — a captured or synthetic delivery payload with stable identity.
- **Scenario run** — an execution of a failure scenario (duplicates, delays, retries,
  concurrency, out-of-order) against a target endpoint.
- **Delivery attempt** — one HTTP dispatch of an event within a run; duplicates create
  new attempts, not new events.

## 2026-11-13 — Design constraints baked in from the start

These invariants come from the project brief and shape upcoming modules:

- Delivery logic stays independent of any dashboard/UI; the UI observes the engine.
- Raw request bytes are preserved for signature-sensitive operations.
- Local services bind to loopback by default.
- Request sizes, response capture, retries, concurrency, and timeouts are bounded.
- Database-backed scheduling is used where runs must survive restarts; shutdown and
  interrupted-run behaviour are defined explicitly.
- Secrets never appear in logs, fixtures, source control, or exported reports.

## 2026-11-13 — CI

GitHub Actions on PRs and pushes to `main`. Third-party actions are pinned to full
commit SHAs, jobs have timeouts and concurrency cancellation, and the workflow needs
only `contents: read`. No secrets are required, so fork PRs can run the same checks.
