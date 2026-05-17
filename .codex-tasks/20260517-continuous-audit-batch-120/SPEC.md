# Continuous Audit Batch 120

## Scope

Audit and harden the Tauri session response contract without changing valid session behavior.

## Finding

`tauriSessionResponse()` serializes `opened.session.accessToken` directly and converts `expiresAt` with `Date.parse()` without checking the result. A corrupted session can emit a non-string token or `NaN`, which becomes `null` in JSON responses.

## Constraints

- Do not change valid session response fields or permissions.
- Reject only malformed internal session token or expiration data.
- Keep changes local to Tauri contract helpers and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
