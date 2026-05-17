# Batch 60 - Validate conflict decision payload shape

## Scope

- Audit and minimally fix commit payload validation for conflict decisions.
- Do not change valid conflict resolution behavior, no-conflict commits, or commit response shape.

## Finding

`commitPlan()` passes `body.conflictDecisions || {}` into push commit handling. A malformed non-object `conflictDecisions` value is silently accepted for no-conflict push plans and can only fail incidentally when conflicts exist.

## Validation

- Focused regression: `timeout 60s node server/test/storage-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
