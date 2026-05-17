# Batch 87 - TT-Sync Account List Text Validation

## Scope

Audit TT-Sync account device/history list text rendering.

## Constraints

- Do not change account routes, list shape validation, or valid item rendering.
- Only suppress malformed non-scalar text values at the display boundary.
- Keep numeric count handling unchanged.

## Finding

Device and history list text fields are passed directly into `join()` or template literals. Malformed object or boolean values can render as `[object Object]` or `true` in the UI.

## Validation

- `node tools/test/tt-sync-account-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
