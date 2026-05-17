# Continuous Audit Batch 140

## Goal

Validate stream upload expected size before filesystem or stream side effects.

## Constraints

- No feature changes.
- Preserve valid streaming upload behavior.
- Keep malformed metadata failures explicit.
- Commit only after validation passes.
