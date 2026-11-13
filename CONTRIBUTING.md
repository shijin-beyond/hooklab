# Contributing to HookLab

Thanks for helping make webhook failures boring. This file is the short version;
[AGENTS.md](AGENTS.md) has the full engineering and collaboration rules.

## Setup

Requires Node.js >= 20 and npm.

```sh
npm ci
npm test
```

## Before opening a PR

Run the same checks CI runs:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Conventions

- Branch names: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `ci/<topic>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(delivery): add configurable duplicate requests`.
- Keep PRs focused: one coherent change per PR, no unrelated formatting or refactors.
- Tests should cover observable behaviour and failure boundaries, not implementation
  details.
- Describe what the change does and what you actually verified. If a check could not
  run, say why.

## What is out of scope

Accounts, billing, teams, a hosted relay, and unrelated AI features. See the
"Scope" section of [AGENTS.md](AGENTS.md).

## License

No license has been chosen yet. By opening a PR you acknowledge the project's license
is pending; the maintainers will flag the decision before public release.
