# Batch 88 - TT-Sync Account List Item Validation

## Scope

Audit TT-Sync account device/history list item shape handling.

## Constraints

- Do not change valid list rendering.
- Do not change list array validation or account routes.
- Convert malformed item TypeErrors into explicit account payload errors.

## Finding

`accountList()` checks only that `devices/history` is an array. Null or primitive entries later reach item formatters and can throw generic TypeErrors without account payload context.

## Validation

- `node tools/test/tt-sync-account-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
