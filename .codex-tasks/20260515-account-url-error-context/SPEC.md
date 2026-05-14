# Account URL Error Context

## Goal

Make invalid TT-Sync account endpoint URLs fail with field-specific diagnostics.

## Scope

- Preserve valid account endpoint normalization.
- Replace raw `URL` constructor errors with a user-facing account endpoint message.
- Add frontend static coverage.

