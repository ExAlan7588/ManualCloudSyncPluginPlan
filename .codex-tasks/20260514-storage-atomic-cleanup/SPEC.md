# Storage Atomic Cleanup

## Goal

Prevent failed atomic writes from leaving temporary files in storage directories.

## Scope

- Keep existing successful write behavior unchanged.
- Keep original write/rename failures visible.
- Add focused validation for cleanup on failure.

