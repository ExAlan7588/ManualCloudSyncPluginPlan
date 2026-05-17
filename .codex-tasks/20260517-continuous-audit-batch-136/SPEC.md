# Continuous Audit Batch 136

## Goal

Reject malformed plan `deviceId` values before commit mutations begin.

## Constraints

- No feature changes.
- Preserve valid plan history response shape.
- Keep malformed persisted plan failures explicit.
- Commit only after validation passes.
