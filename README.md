# hooklab

HookLab is an open-source webhook failure-testing tool. It is being built for
developers who ship webhook handlers and want to reproduce the deliveries that break
real integrations — duplicates, delayed deliveries, retries, concurrent bursts, and
out-of-order events — before they hit payments, bookings, or notifications in
production. The initial audience is Node.js and PHP developers.

**Status: early development.** The failure-injection engine and local dashboard are
under construction; the repository currently contains the project foundation
(toolchain, checks, and conventions). Nothing here is ready to test your webhooks yet —
watch the repo or check the roadmap issues to follow progress.

## Quick start (development)

Requires Node.js >= 20 and npm.

```sh
npm ci              # install dependencies
npm test            # run tests
npm run typecheck   # strict type check
npm run lint        # lint
npm run build       # compile to dist/
```

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to propose changes
- [AGENTS.md](AGENTS.md) — engineering and collaboration rules
- [docs/architecture.md](docs/architecture.md) — recorded design decisions

## License

The license has not been chosen yet. See the open decision in the project tracker
before relying on redistribution terms; contributions are welcome under
[CONTRIBUTING.md](CONTRIBUTING.md).
