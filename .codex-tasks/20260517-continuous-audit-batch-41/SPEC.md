# Batch 41 - Validate plan staged map shape

## Scope

- Audit and minimally fix plan progress response handling for malformed persisted staged maps.
- Do not change valid response shapes, API contracts, or user-visible behavior for valid plans.

## Finding

`progressSummary()` and `currentProgressPath()` read `plan.staged || {}` through `Object.values()` / `Object.keys()`. A malformed persisted staged value such as a string or array can be interpreted as staged entries/paths instead of failing with an explicit plan-shape error.

## Validation

- Focused regression: `timeout 60s node server/test/plan-response-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
