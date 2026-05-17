# Batch 45 - Preflight namespace commit record shape

## Scope

- Audit and minimally fix commit ordering around namespace record shape validation.
- Do not change valid commit behavior, API contracts, or user-visible behavior for valid namespaces.

## Finding

`recordCommittedPlan()` validates and updates namespace `devices`, `syncHistory`, and `rollbackPoints` after push file and manifest side effects. If persisted namespace JSON is malformed, a push can mutate remote files before failing while recording commit metadata.

## Validation

- Focused regression: `timeout 60s node server/test/storage-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
