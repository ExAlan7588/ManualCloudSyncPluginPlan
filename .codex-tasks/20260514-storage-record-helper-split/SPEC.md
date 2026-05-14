# Storage Record Helper Split

## Goal

Reduce `server/lib/storage.js` size risk by moving record-shaping helpers out of the storage class file.

## Scope

- Preserve storage behavior and response shapes.
- Move device/history/rollback helper functions into a focused module.
- Add unit coverage for the moved helpers.

