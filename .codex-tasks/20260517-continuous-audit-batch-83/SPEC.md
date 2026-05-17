# Batch 83 - Data Migration Job Id Validation

## Scope

Audit data migration import/export job id handling for malformed API payloads.

## Constraints

- Do not change user-visible successful behavior or API contracts.
- Only reject malformed `job_id` values before polling.
- Keep failures explicit and covered by focused regression tests.

## Finding

`requireJobId()` coerces any truthy `job_id` with `String(...)`. A malformed object payload becomes `[object Object]`, causing the client to poll a synthetic job id instead of surfacing the protocol error at the boundary.

## Validation

- `node tools/test/data-migration-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
