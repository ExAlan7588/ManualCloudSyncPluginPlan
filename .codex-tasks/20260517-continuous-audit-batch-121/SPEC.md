# Continuous Audit Batch 121

## Scope

Audit and harden the Tauri pairing response server identity field without changing valid pairing behavior.

## Finding

`tauriPairingResponse()` serializes `record.serverId` directly as `server_device_id`. The Tauri contract expects a UUID server identifier, but a malformed namespace record can emit an object, blank value, or non-UUID string.

## Constraints

- Do not change valid pairing response fields or permissions.
- Reject only malformed internal `record.serverId` values.
- Reuse existing UUID validation behavior.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
