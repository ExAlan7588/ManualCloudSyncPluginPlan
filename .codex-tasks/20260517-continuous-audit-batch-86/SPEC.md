# Batch 86 - TT-Sync Account Pairing Payload Validation

## Scope

Audit TT-Sync account pairing response rendering.

## Constraints

- Do not change valid pairing URI behavior.
- Do not change account routes or user workflow.
- Reject malformed pairing payload fields before writing them into UI inputs/status text.

## Finding

`renderPairingUri()` coerces `pairingUri` with `String(...)`, and `expiryText()` interpolates `expiresAt` directly. Malformed object payloads can be displayed as `[object Object]`.

## Validation

- `node tools/test/tt-sync-account-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
