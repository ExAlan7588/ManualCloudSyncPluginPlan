# Batch 42 - Validate storage record summary arrays

## Scope

- Audit and minimally fix storage record summary helpers for malformed persisted array fields.
- Do not change valid response shapes, API contracts, or user-visible behavior for valid plans or rollback points.

## Finding

`affectedPaths()`, `historyEntry()`, and `rollbackPointSummary()` assume persisted plan and rollback summary fields are arrays. Corrupted stored JSON can surface low-level TypeErrors or incorrect summary counts instead of an explicit data-shape error.

## Validation

- Focused regression: `timeout 60s node server/test/storage-records-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
