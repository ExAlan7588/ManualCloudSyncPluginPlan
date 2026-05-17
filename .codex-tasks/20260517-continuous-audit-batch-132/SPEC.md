# Continuous Audit Batch 132

## Goal

Reject non-string sync mode inputs instead of silently defaulting them to `Incremental`.

## Constraints

- No feature changes.
- No user-visible behavior changes for valid inputs.
- Keep malformed input failures explicit.
- Commit only after tests and validation pass.
