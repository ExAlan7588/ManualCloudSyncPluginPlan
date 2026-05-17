# Batch 85 - TT-Sync Account Session Payload Validation

## Scope

Audit TT-Sync account login/refresh session payload handling.

## Constraints

- Do not change valid login or refresh behavior.
- Do not change account API routes or UI workflow.
- Reject malformed session token fields before storing them in local UI state.

## Finding

`updateSession()` coerces `accessToken`, `refreshToken`, and `namespace` with `String(...)`. Malformed object payloads can become `[object Object]`, then be displayed or sent as bearer tokens in follow-up requests.

## Validation

- `node tools/test/tt-sync-account-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
