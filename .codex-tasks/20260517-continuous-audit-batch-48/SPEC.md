# Batch 48 - Validate upload entry plan arrays

## Scope

- Audit and minimally fix upload entry lookup for malformed persisted plan uploads.
- Do not change valid upload, bundle, or stream behavior.

## Finding

`uploadEntry()` calls `plan.uploads.find(...)` directly. If persisted plan JSON stores `uploads` as a non-array value, upload staging paths surface a low-level `.find is not a function` error instead of the explicit plan-shape error used elsewhere.

## Validation

- Focused regression: `timeout 60s node server/test/storage-io-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
