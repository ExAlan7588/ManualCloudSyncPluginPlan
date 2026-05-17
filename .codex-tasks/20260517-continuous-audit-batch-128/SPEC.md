# Continuous Audit Batch 128

## Scope

Audit remaining account pairing response fields and reject malformed endpoint, SPKI, or namespace data before URI serialization.

## Finding

`accountPairingResponse()` now validates token fields, but still serializes `endpoint`, `spki`, and `namespace` directly. Corrupted options can produce pairing URIs with URL credentials/fragments, malformed SPKI pins, or unsafe namespace text.

## Constraints

- Do not change valid account pairing URI response shape.
- Reject only malformed response input fields.
- Keep the fix local to account response helpers and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
