# Continuous Audit Batch 37

## Scope

Audit TT-Sync account panel JSON response error context.

## Finding

`modules/tt-sync-account.js` calls `response.json()` directly for successful
account API responses. If a server returns 2xx with malformed JSON, the UI sees
a generic parser error without the account route that produced the bad payload.

## Constraints

- Do not change valid account API behavior.
- Preserve existing non-2xx error handling through `readFailureMessage`.
- Add explicit route context for malformed 2xx JSON responses.

## Validation

- `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
