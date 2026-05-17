# Batch 82 - Data migration status text filtering

## Finding

`updateStatusFromDataArchiveJob()` stringifies every status part. Malformed API
payloads can therefore render `[object Object]` or `true` in the status text.

## Scope

- Treat malformed non-scalar status text values as absent.
- Preserve normal string status and numeric progress rendering.
- Add focused data migration coverage without extending the large frontend
  test file.

## Validation

- `node tools/test/data-migration-run-tests.js`
- `npm run check`
- `npm test`
