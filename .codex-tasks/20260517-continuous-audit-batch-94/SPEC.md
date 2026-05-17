# Batch 94 - TT-Sync Server List Item Validation

## Scope

Audit TT-Sync server list item shape handling.

## Constraints

- Do not change valid server list behavior.
- Do not change missing `servers` fallback behavior.
- Reject malformed server entries at the list boundary.

## Finding

`serverListFrom()` validates only that the server list is an array. Null or primitive entries can pass through and render empty options or misleading state instead of surfacing a malformed payload.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
