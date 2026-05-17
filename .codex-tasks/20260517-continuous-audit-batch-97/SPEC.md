# Batch 97 - TT-Sync Conflict Path Validation

## Scope

Audit TT-Sync conflict path/key handling.

## Constraints

- Do not change valid conflict rendering or decisions.
- Do not change missing conflict payload behavior.
- Reject conflict entries that cannot produce a stable path key.

## Finding

Conflict `path` is both display text and the local decision key. Missing, blank, or malformed paths collapse to the same `未回傳` key and can overwrite conflict choices across entries.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
