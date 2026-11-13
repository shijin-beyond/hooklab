# AGENTS.md

How to work in this repository. These rules apply to humans and coding agents alike.

## What this is

HookLab is an open-source webhook failure-testing tool. It helps developers reproduce
duplicate, delayed, retried, concurrent, and out-of-order webhook deliveries. The initial
audience is Node.js and PHP developers.

Treat it as a maintained developer tool: correctness, easy installation, readable code,
reproducible tests, and concise documentation come first.

## Before changing anything

- Inspect the repository, these instructions, and the current Git state.
- Preserve existing user changes.
- Follow established project conventions.
- Record important architectural decisions briefly in `docs/architecture.md`.
- Keep this file current when conventions change.

## Commands

```sh
npm ci              # install dependencies (uses package-lock.json)
npm test            # run tests (vitest)
npm run typecheck   # strict TypeScript check (server + web)
npm run lint        # eslint
npm run format:check  # prettier check
npm run format      # prettier write
npm run build       # compile server to dist/ and dashboard to web/dist/
npm run dev         # tsx watch server + vite dev server
npm start           # run the built app (UI + API on 127.0.0.1:4737)
npm run example:receiver  # local counting receiver on 127.0.0.1:4040
```

Layout: `src/` is the Fastify + node:sqlite backend, `web/` the React+Vite dashboard,
`test/` vitest suites, `examples/` standalone helpers.

## Scope

- Build in small, reviewable increments.
- Do not add speculative features, unnecessary dependencies, or abstractions without a
  concrete need.
- Do not implement accounts, billing, teams, a hosted relay, or unrelated AI features.
- Never describe planned features as available.

## Code quality

- TypeScript with strict checking.
- Validate external inputs and handle failures explicitly.
- Keep delivery logic independent from the dashboard.
- Keep webhook events, scenario runs, and delivery attempts as separate concepts.
- Preserve raw request bytes for signature-sensitive operations.
- Use database-backed scheduling where restart recovery is required.
- Define shutdown and interrupted-run behaviour explicitly.
- Bind local services to loopback by default.
- Bound request sizes, response capture, retries, concurrency, and timeouts.
- Keep secrets out of logs, source control, fixtures, and exported reports.

## Git workflow

- Use short-lived branches with descriptive names:
  `feat/duplicate-delivery`, `fix/retry-timeout`, `docs/local-setup`,
  `ci/pull-request-checks`.
- Commits are coherent changes that are understandable independently.
- Do not create artificial commits to inflate activity.
- Do not mix unrelated formatting or refactors into feature changes.
- Inspect the staged diff before committing.
- Do not commit build output, credentials, local databases, or debug logs.
- Do not rewrite shared history or force-push without explicit authorization.

### Commit messages

Use Conventional Commits:

- `feat(delivery): add configurable duplicate requests`
- `fix(worker): stop retries after cancellation`
- `test(delivery): cover concurrent duplicate attempts`
- `docs: explain local webhook capture`
- `ci: run checks on pull requests`

Keep subjects short, specific, and accurate. Use bodies only to explain a meaningful
reason or tradeoff. Avoid generic messages like "update code" or "final fixes".
Preserve accurate author information and attribution. Do not impersonate contributors
or fabricate human review.

## Pull requests

- Open a focused PR for each coherent task. Do not merge unless explicitly authorized.
- Use a descriptive title, and a description covering:
  - the concrete problem,
  - the resulting behaviour,
  - validation actually performed,
  - material limitations or follow-up work.
- Never claim a test, review, benchmark, or manual check happened unless it did.
- If a check could not run, say why.
- Do not invent issue references, reviewers, user reports, or performance results.

## GitHub Actions

- Workflows must run real checks supported by the repository.
- Use current, supported action versions, pinned to full commit SHAs.
- Use minimal token permissions, readable job names, timeouts, and concurrency controls.
- Install dependencies deterministically with `npm ci` against the committed lockfile.
- Cache dependencies appropriately.
- Keep PR workflows safe for forks and free of required secrets; do not run untrusted
  PR code through privileged workflows.
- Do not add workflows that merely produce green badges.
- CI covers: formatting, linting, type checking, meaningful tests, production build.
- Add package-install, CLI smoke, or Docker checks when those deliverables exist.
- Keep release/publication workflows separate from CI.
- Do not publish packages, releases, or container images without explicit authorization.

## Testing

Focus tests on observable behaviour and failure boundaries:

- Duplicate events preserve event identity while attempts get distinct IDs.
- Retries follow the configured policy and stop at the limit.
- Timeouts, cancellation, and interrupted runs behave correctly.
- Raw payload bytes remain intact.
- Concurrency limits are respected.
- Invalid inputs are rejected.
- Secrets are redacted from exported output.

Use controlled clocks and local test servers where appropriate. Avoid timing-sensitive
tests and real third-party API calls in CI. Do not write tests that merely repeat
implementation details. An HTTP 200 response proves delivery acceptance, not business
correctness.

## Public writing

- Write like an engineer explaining a useful tool to another engineer.
- Plain language, concrete examples, verifiable claims.
- No filler, excessive emojis, marketing superlatives, or repetitive template language.
- Do not use "revolutionary", "enterprise-grade", "production-ready", or "blazing fast"
  without defensible evidence.
- Do not add unnecessary AI references to product copy.
- Do not fabricate testimonials, usage statistics, affiliations, contributors, or
  roadmap completion.

## Documentation

- README: what the tool does, a real screenshot/demo when available, quick start, one
  working example, supported behaviour and limitations, links to contribution and
  technical docs.
- Document only commands that work.
- Badges only when they link to real checks or published artifacts.
- Keep CONTRIBUTING.md, a useful issue template, and a concise PR template current.
- Do not invent a security contact or promise a response time.
- Flag an unchosen license before public release rather than silently choosing one.

## Definition of done

1. Inspect the final diff.
2. Run the checks appropriate to the change.
3. Correct discovered failures.
4. Confirm documentation matches implemented behaviour.
5. Report the result, validation, and remaining limitations concisely.
6. Provide the branch, commit, and PR link when available.

Never substitute a polished completion message for working software.
