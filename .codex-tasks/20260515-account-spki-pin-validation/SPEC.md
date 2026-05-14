# Account SPKI Pin Validation

## Goal

Reject malformed account pairing SPKI pins before creating a TauriTavern pairing URI.

## Scope

- Preserve valid base64url SHA-256 pin values.
- Keep account pairing URI shape unchanged.
- Add route-level unit coverage without starting a listener.
