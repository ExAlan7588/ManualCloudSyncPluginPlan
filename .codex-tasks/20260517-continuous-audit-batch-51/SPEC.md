# Batch 51 - Validate route plan entry arrays

## Scope

- Audit and minimally fix dynamic plan file/bundle route entry lookup for malformed persisted plan arrays.
- Do not change valid file, bundle, upload, or download behavior.

## Finding

Route-level `findPlanEntry()` calls `.find()` on `uploads` or `downloads` without validating the persisted plan field shape. Malformed plan JSON can surface low-level method errors from file and bundle routes instead of explicit plan-shape errors.

## Validation

- Focused regression: `timeout 60s node server/test/routes-unit-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
