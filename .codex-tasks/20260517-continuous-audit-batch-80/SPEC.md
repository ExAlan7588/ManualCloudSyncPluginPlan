# Batch 80 - WebDAV auth secret validation

## Finding

`webDavAuthHeaders()` can stringify missing or malformed credentials into an
Authorization header, for example `undefined` or `[object Object]`. Normal
configuration validation prevents this in the main path, but the helper
boundary should reject malformed secret values explicitly.

## Scope

- Reject missing/malformed Basic username/password values.
- Reject missing/malformed Bearer token values.
- Preserve valid Basic and Bearer Authorization output.
- Extend focused WebDAV URL/auth helper tests.

## Validation

- `node tools/test/webdav-url-run-tests.js`
- `npm run check`
- `npm test`
