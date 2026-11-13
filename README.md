# hooklab

HookLab is an open-source webhook failure-testing tool. It is being built for
developers who ship webhook handlers and want to reproduce the deliveries that break
real integrations — duplicates, delayed deliveries, retries, concurrent bursts, and
out-of-order events — before they hit payments, bookings, or notifications in
production. The initial audience is Node.js and PHP developers.

**Status: early development.** The first slice works: you can store an event, send it
once or as sequential duplicates to a local endpoint, and inspect every attempt's
status, duration, response preview, and error — with history persisted in SQLite.
Delays, retries, concurrency, and out-of-order delivery are not implemented yet.

## Quick start

Requires Node.js >= 22.13 (built-in `node:sqlite`; Node 24 recommended) and npm.

```sh
npm ci          # install dependencies
npm run build   # build server (dist/) and dashboard (web/dist/)
npm start       # serves UI + API on http://127.0.0.1:4737
```

In the dashboard: paste a JSON event, set the target URL, choose the number of
deliveries and the interval between them, hit **Send**. Each delivery is a separate
attempt of the same event — open a run to see per-attempt status, HTTP code,
duration, response preview, and errors. History survives restarts.

### Try it against the example receiver

```sh
node examples/local-receiver.mjs   # counts requests on 127.0.0.1:4040
```

Point HookLab at `http://127.0.0.1:4040/hook` and send with Deliveries > 1 — the
receiver logs one line per request and returns a running count. See
[examples/README.md](examples/README.md) for the equivalent curl commands.

### Development

```sh
npm run dev        # tsx watch server + vite dev server (proxies /api)
npm test           # vitest
npm run typecheck  # strict type check (server + web)
npm run lint
npm run format:check
npm run build
```

## What it does and doesn't do (this milestone)

- Generic HTTP/HTTPS webhooks only — no provider-specific adapters, signatures,
  automatic retries, concurrency, authentication, hosted tunnels, or publishing.
- Events are immutable; payload bytes are delivered verbatim (no reserialization).
- Duplicates are sequential with a configurable interval; each attempt has its own ID.
- Payload size, response capture, delivery count, interval, and timeout are bounded;
  transport-controlled headers are rejected; the app binds to loopback by default.
- Runs interrupted by shutdown are marked `interrupted` and never resent.
- HTTP responses are transport outcomes — a 200 means "delivered", not "processed".

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to propose changes
- [AGENTS.md](AGENTS.md) — engineering and collaboration rules
- [docs/architecture.md](docs/architecture.md) — recorded design decisions

## License

The license has not been chosen yet. See the open decision in the project tracker
before relying on redistribution terms; contributions are welcome under
[CONTRIBUTING.md](CONTRIBUTING.md).
