# Batch 90 - TT-Sync Account Response Boundary Validation

## Scope

Audit TT-Sync account fetch response handling.

## Constraints

- Do not change valid Response handling or account request routes.
- Keep HTTP failure behavior unchanged for real Response objects.
- Surface malformed adapter responses with account route context.

## Finding

`accountRequest()` assumes `deps.fetch()` returns a Response-like object. Null or incomplete adapter responses can throw generic TypeErrors at `.ok` or `.json()` without route context.

## Validation

- `node tools/test/tt-sync-account-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
