# Batch 58 - Ignore client-injected opposite plan arrays

## Scope

- Audit and minimally fix planner output so request bodies cannot inject transfer/delete arrays for the opposite sync direction.
- Do not change valid push/pull diff behavior, manifest comparison, authentication, or API shape.

## Finding

`planEnvelope()` uses `input.uploads || []`, `input.downloads || []`, `input.remoteDeletes || []`, and `input.localDeletes || []`. Because route handlers spread request bodies into planner input, a push-plan request can inject `downloads` or `localDeletes`, and a pull-plan request can inject `uploads` or `remoteDeletes` into the persisted plan and response.

## Validation

- Focused regression: `timeout 60s node server/test/routes-unit-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
