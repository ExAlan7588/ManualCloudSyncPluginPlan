# Batch 114 - Storage Record Plan Path Validation

## Scope

Audit storage record helpers that derive affected paths and history from plans.

## Constraints

- Do not change valid affected path or history output.
- Do not add compatibility fallbacks for malformed plans.
- Reject unstable path values before rollback or history derivation.

## Finding

`affectedPaths()` and `historyEntry()` only verify plan fields are arrays. Malformed entry paths or delete paths can be counted or used to build rollback snapshots with unstable values.

## Validation

- `node server/test/storage-records-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
