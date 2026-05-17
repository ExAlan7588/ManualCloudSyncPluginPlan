# Continuous Audit Batch 34

## Scope

Audit rollback restore validation order.

## Finding

`restoreRollbackFiles()` writes rollback file content before re-validating the
rollback entry that will be written into the manifest. A polluted rollback JSON
with malformed `entry.modifiedMs` can write a remote file and then fail manifest
normalization, leaving filesystem and manifest state inconsistent.

## Constraints

- Do not change valid rollback restore behavior.
- Validate rollback file path and entry before writing content.
- Keep malformed rollback data visible through explicit errors.

## Validation

- `timeout 60s node server/test/storage-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
