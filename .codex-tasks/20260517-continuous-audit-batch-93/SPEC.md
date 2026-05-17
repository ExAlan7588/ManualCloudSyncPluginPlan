# Batch 93 - TT-Sync Server Text Field Validation

## Scope

Audit TT-Sync server label and status text rendering.

## Constraints

- Do not change valid server selection or status behavior.
- Do not change server id extraction.
- Suppress malformed non-scalar server display text instead of stringifying it.

## Finding

`serverLabel()` and `serverStatus()` interpolate server name/base URL fields directly. Malformed object payloads can render as `[object Object]` in options or status.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
