# Continuous Audit Batch 39

## Scope

Audit saved plan namespace normalization after authentication.

## Finding

`loadAuthedPlan()` authenticates with `safeName(plan.namespace)` but returns the
raw saved plan. If a plan JSON is polluted with `namespace: " default "`, commit
and file/bundle handlers can continue using that raw namespace after successful
auth.

## Constraints

- Do not change valid plan behavior.
- Keep authentication unchanged.
- Normalize the loaded plan namespace once at the route boundary.

## Validation

- `timeout 60s node server/test/routes-unit-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
