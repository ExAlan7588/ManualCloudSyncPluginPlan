# Continuous Audit Batch 139

## Goal

Make malformed upload entries fail with explicit validation errors before staging logic uses them.

## Constraints

- No feature changes.
- Preserve valid upload lookup behavior.
- Keep malformed persisted plan failures explicit.
- Commit only after validation passes.
