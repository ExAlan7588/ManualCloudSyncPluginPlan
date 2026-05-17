# Batch 78 - WebDAV URL key validation

## Finding

`webDavUrlForKey()` directly calls `.split()` on `key`, so malformed callers
receive a generic TypeError instead of a WebDAV key validation error.

## Scope

- Validate `key` as non-empty text in the URL helper.
- Preserve existing URL construction for valid keys.
- Add focused tests for malformed and normal key handling.

## Validation

- `node tools/test/webdav-url-run-tests.js`
- `npm run check`
- `npm test`
