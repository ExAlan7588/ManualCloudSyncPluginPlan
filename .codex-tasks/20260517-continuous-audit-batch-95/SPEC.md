# Batch 95 - TT-Sync Conflict List Item Validation

## Scope

Audit TT-Sync conflict list item shape handling.

## Constraints

- Do not change valid conflict rendering.
- Do not change missing conflict payload behavior.
- Reject malformed conflict entries before rendering actions.

## Finding

`conflictListFrom()` validates only that `conflicts` is an array. Null or primitive entries can render as empty conflict rows with shared `未回傳` keys and action buttons.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
