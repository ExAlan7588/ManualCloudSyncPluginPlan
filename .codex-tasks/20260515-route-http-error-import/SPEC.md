# Route HttpError Import

## Goal

Restore explicit 400 responses for unsupported account pairing endpoint URL schemes.

## Scope

- Fix the missing `HttpError` import in route URL parsing.
- Add handler-level coverage that does not require local listen permissions.
- Keep endpoint validation behavior unchanged.

