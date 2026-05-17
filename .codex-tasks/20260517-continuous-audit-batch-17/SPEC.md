# Continuous Audit Batch 17

## Scope

Audit deploy verification input validation for minimal, non-feature-changing fixes.

## Finding

`tools/verify-tt-sync-deploy.js` validates `TT_SYNC_PORT` with `Number(value)`.
That accepts non-decimal JavaScript number syntax such as `0x2500` or `1e3`,
allowing abnormal env file values to pass deploy verification.

## Constraints

- Do not change runtime server behavior, APIs, or user-visible feature behavior.
- Keep the fix limited to deploy verification and its tests.
- Surface malformed configuration explicitly instead of silently normalizing it.

## Validation

- `timeout 60s node tools/test/deploy-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
