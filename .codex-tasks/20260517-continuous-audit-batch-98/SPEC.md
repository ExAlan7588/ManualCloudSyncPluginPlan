# Batch 98 - TT-Sync Server Timestamp Boundary

## Scope

Audit TT-Sync server `last_sync_ms` status rendering.

## Constraints

- Do not change valid timestamp formatting.
- Do not change invalid timestamp preservation behavior for scalar text.
- Avoid showing malformed non-scalar timestamps and keep zero timestamp visible.

## Finding

`serverStatus()` checks `server?.last_sync_ms` before formatting. This hides valid `0` timestamps and displays malformed truthy objects as `最後同步：未回傳`.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
