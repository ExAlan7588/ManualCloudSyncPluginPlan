# Continuous Audit Batch 127

## Scope

Audit account pairing response token fields and reject malformed pairing token data before URI serialization.

## Finding

`accountPairingResponse()` and `tauriPairingUri()` use pairing token records directly. A corrupted token can generate successful responses with empty tokens or `exp=NaN` inside the pairing URI.

## Constraints

- Do not change valid account pairing URI response shape.
- Reject only malformed internal pairing token fields.
- Keep the fix local to account response helpers and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
