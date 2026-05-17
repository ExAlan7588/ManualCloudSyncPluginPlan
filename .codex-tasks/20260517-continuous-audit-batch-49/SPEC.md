# Batch 49 - Validate namespace list response arrays

## Scope

- Audit and minimally fix namespace list APIs for malformed persisted array fields.
- Do not change valid devices, history, or rollback point response shapes.

## Finding

`listDevices()`, `listHistory()`, and `listRollbackPoints()` return persisted fields with `|| []`. If namespace JSON stores these fields as non-array values, API responses can expose malformed data as if it were valid.

## Validation

- Focused regression: `timeout 60s node server/test/storage-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
