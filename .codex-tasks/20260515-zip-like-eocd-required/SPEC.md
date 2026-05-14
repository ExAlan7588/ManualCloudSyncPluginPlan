# ZIP-Like EOCD Required

## Goal

Prevent corrupt ZIP-like artifacts from being scanned as raw trusted build artifacts.

## Scope

- Require EOCD for `.apk`, `.aab`, `.jar`, and `.zip` inputs.
- Preserve non-ZIP source file behavior.
- Add verifier coverage for corrupt APK false-positive prevention.

