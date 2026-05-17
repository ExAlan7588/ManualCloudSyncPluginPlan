# Continuous Audit Batch 40

## Scope

Audit plan response handling for malformed persisted plan arrays.

## Finding

`planSummary()` and `progressSummary()` assume persisted plan arrays such as
`uploads`, `downloads`, `conflicts`, `remoteDeletes`, and `localDeletes` are
valid arrays. If a plan JSON is corrupted, callers get low-level TypeErrors
instead of explicit plan structure errors.

## Constraints

- Do not change valid plan response shapes.
- Keep existing size validation behavior.
- Fail with explicit plan field errors for malformed array fields.

## Validation

- `timeout 60s node server/test/plan-response-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
