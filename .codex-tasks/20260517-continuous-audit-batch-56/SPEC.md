# Batch 56 - Validate bundle download plan entries

## Scope

- Audit and minimally fix plan download bundle handling for malformed persisted plan arrays.
- Do not change valid bundle response shape, file streaming behavior, authentication, or plan APIs.

## Finding

Single-file plan downloads validate `plan.downloads` through `findPlanEntry()`, but bundle downloads iterate `plan.downloads` directly. A malformed persisted plan therefore surfaces a low-level iterable error instead of the explicit `Invalid plan downloads` error used by adjacent route code.

## Validation

- Focused regression: `timeout 60s node server/test/routes-unit-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
