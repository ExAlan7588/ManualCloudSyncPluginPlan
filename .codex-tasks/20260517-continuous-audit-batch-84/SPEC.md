# Batch 84 - Data Migration Job State Validation

## Scope

Audit data migration job status handling for malformed state payloads.

## Constraints

- Do not change the valid import/export success path.
- Do not alter polling cadence or terminal state names.
- Surface malformed API payloads explicitly instead of continuing with invalid state.

## Finding

`pollDataArchiveJob()` checks `TERMINAL_JOB_STATES.has(status.state)` directly. A non-string `state` payload is treated as non-terminal and polling continues, delaying or masking the malformed API response.

## Validation

- `node tools/test/data-migration-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
