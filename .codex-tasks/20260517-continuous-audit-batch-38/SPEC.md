# Continuous Audit Batch 38

## Scope

Audit server route namespace normalization after authentication.

## Finding

Non-Tauri `/v2/session/open` and sync plan routes authenticate with
`safeName(namespace)` but pass the original request namespace into later storage
operations and response bodies. Inputs such as ` default ` can authenticate as
`default` while producing plans or session responses with the unnormalized value.

## Constraints

- Do not change valid namespace behavior.
- Keep `safeName` validation as the single namespace boundary.
- Use the same normalized namespace for auth, storage reads, plans, and session responses.

## Validation

- `timeout 60s node server/test/routes-unit-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
