# Continuous Audit Batch 125

## Scope

Audit account session response contract fields and reject malformed token or timestamp data before serialization.

## Finding

`sessionResponse()` returns access/refresh tokens and expiration fields directly from session records. A corrupted session can emit non-string token data or non-ISO timestamps as a successful JSON response.

## Constraints

- Do not change valid account login, refresh, or session response shape.
- Reject only malformed internal session response fields.
- Keep the fix local to account response helpers and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
