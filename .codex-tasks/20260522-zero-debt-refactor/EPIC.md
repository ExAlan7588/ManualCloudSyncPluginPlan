# Zero Debt Refactor Epic

## Goal

Bring `/home/alan/opt/ManualCloudSyncPluginPlan` toward a zero technical debt, best-practice implementation without preserving obsolete compatibility layers, dead code, inconsistent style, or weak abstractions.

## Operating Model

- MAGI cycle:
  - Review: inspect architecture, ask what is inconsistent or wasteful, and expose failures.
  - Execute: refactor directly when the code is weak, with no silent fallbacks.
  - Improve: document direction, validate, and commit verified phase work.
- Use Context7 or authoritative online sources before adopting framework or platform-level practices.
- Do not add tests for non-existent behavior.
- Keep failures explicit and visible.

## Scope

- Naming, module layering, import ordering, error handling, and code style consistency.
- Algorithmic and data-structure review for hot paths.
- Memory allocation and stream handling review.
- Concurrency and async behavior review.
- Dead-code removal.
- Removal of compatibility aliases and obsolete transitional wrappers when they are only preserving old internals.
- Taskmaster-compatible progress files for recovery.

## Initial Findings

- JavaScript ESM project with no runtime third-party dependencies.
- Existing package scripts run syntax checks and a large set of ad hoc Node test files.
- `server/lib/storage.js`, `server/lib/routes.js`, several verifier tools, and large test files are near or above desired file-size limits.
- Current tests are executable and should be used as the first safety net before deeper refactors.
- Official Node guidance supports using built-in ESM imports, `node:fs/promises`, `node:stream/promises`, `node:timers/promises`, and `node:test` for modernization.

## Validation Gates

- `timeout 60 npm run check`
- `timeout 60 npm test`
- Additional focused tests for touched behavior.

