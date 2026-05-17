# Batch 77 - WebDAV transport helper split

## Finding

`modules/webdav-compat.js` has grown to 483 lines and continues to accumulate
transport, auth, manifest, and queue responsibilities. This raises maintenance
risk and pushes the file toward the project 600-line hard limit.

## Scope

- Move WebDAV auth header and URL construction helpers into a dedicated module.
- Preserve all public behavior and existing imports for user-facing flows.
- Keep validation unchanged and rely on existing WebDAV test coverage.

## Validation

- `node tools/test/webdav-compat-run-tests.js`
- `node tools/test/webdav-transfer-run-tests.js`
- `npm run check`
- `npm test`
