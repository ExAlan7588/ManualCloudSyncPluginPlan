# Continuous Audit Batch 126

## Scope

Audit account session response identity fields and reject malformed namespace or server identifiers before serialization.

## Finding

`sessionResponse()` validates token and expiration fields, but still returns `record.namespace` and `record.serverId` directly. A corrupted namespace record can emit unsafe namespace text or non-UUID server identifiers as a successful JSON response.

## Constraints

- Do not change valid account session response shape.
- Reject only malformed internal namespace or server ID fields.
- Keep the fix local to account response helpers and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
