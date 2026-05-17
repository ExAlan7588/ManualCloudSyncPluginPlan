# Continuous Audit Batch 129

## Scope

Audit device record writes and reject malformed Tauri device identity fields at the storage-record helper boundary.

## Finding

`upsertDevice()` writes `deviceId` and `publicKey` directly from its input. Current Tauri route normalization validates these fields before calling storage, but the helper itself can still persist malformed device records when called directly or by future code.

## Constraints

- Do not change valid device pairing behavior.
- Reject only malformed device identifiers or public keys.
- Keep the fix local to storage record helpers and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
