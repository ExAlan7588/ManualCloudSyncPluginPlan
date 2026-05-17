# Batch 75 - WebDAV queue manifest key validation

## Finding

The download queue item validator checks `zipKey`, but the same item is later
used for remote cleanup through `manifestKey`. A malformed item without a
manifest key can pass the boundary and fail later with unrelated config,
network, or key handling errors.

## Scope

- Extend queue item shape validation to require a non-empty `manifestKey`.
- Preserve valid queue items produced by `compatListQueue()` and uploads.
- Add focused coverage for the missing key case.

## Validation

- `node tools/test/webdav-compat-run-tests.js`
- `npm run check`
- `npm test`
