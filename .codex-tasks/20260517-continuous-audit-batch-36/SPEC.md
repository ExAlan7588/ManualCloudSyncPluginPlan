# Continuous Audit Batch 36

## Scope

Audit data migration JSON response error context.

## Finding

`modules/data-migration.js` calls `response.json()` directly after successful
HTTP responses. If the server returns malformed JSON with a 2xx status, the
caller receives a generic parser error without knowing whether the failed
payload was import start, export start, job status, or save/share response.

## Constraints

- Do not change valid import/export behavior.
- Preserve existing non-2xx error handling through `readFailureMessage`.
- Add explicit JSON parse context for 2xx malformed responses.

## Validation

- `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
