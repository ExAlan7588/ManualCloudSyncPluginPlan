# Batch 105 - Account Pairing Endpoint URL Safety

## Scope

Audit backend account pairing URI endpoint validation.

## Constraints

- Do not change valid http/https endpoint behavior.
- Do not alter account pairing response shape.
- Reject unsafe URL components at the route boundary.

## Finding

`/v2/account/pairing-uri` validates endpoint scheme but allows URL credentials and fragments. Those components can leak secrets into generated pairing URIs or produce non-canonical endpoints.

## Validation

- `node server/test/routes-unit-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
