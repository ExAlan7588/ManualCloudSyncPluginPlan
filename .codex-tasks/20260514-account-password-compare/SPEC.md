# Account password constant-time compare

## Goal

Use constant-time comparison for configured account username/password checks to avoid timing differences in credential validation.

## Scope

- Update `assertAccountLogin()` comparisons.
- Preserve existing success and error behavior.
- Add focused unit tests without starting the HTTP server.
- Run static checks.

## Constraints

- No account feature changes.
- No fallback authentication.
- Missing env vars must still fail explicitly.
