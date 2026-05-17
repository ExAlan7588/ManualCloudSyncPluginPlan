# Batch 101 - TT-Sync Server ID Validation

## Scope

Audit TT-Sync paired server list validation at the frontend boundary.

## Constraints

- Do not change the visible server selection workflow for valid servers.
- Do not alter TT-Sync API calls or payload shape.
- Reject malformed server entries before rendering command parameters.

## Finding

`serverListFrom()` only verifies each server entry is an object. Entries with a missing id or object-valued id can still reach `serverIdOf()`, producing an empty option value or unstable text such as `[object Object]`.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
