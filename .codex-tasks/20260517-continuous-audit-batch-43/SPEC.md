# Batch 43 - Preflight commit history shape before push side effects

## Scope

- Audit and minimally fix commit ordering around persisted plan shape validation.
- Do not change valid commit behavior, API contracts, or user-visible behavior for valid plans.

## Finding

`commitPlan()` records sync history after push side effects. If a persisted plan contains malformed fields that only `historyEntry()` validates, a push can mutate remote files before failing during history recording.

## Validation

- Focused regression: `timeout 60s node server/test/storage-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
