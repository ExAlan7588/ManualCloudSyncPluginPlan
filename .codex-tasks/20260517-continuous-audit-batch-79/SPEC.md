# Batch 79 - WebDAV auth connection validation

## Finding

`webDavAuthHeaders()` assumes a complete connection shape and directly reads
`connection.config.webdav.authMode`. Malformed callers receive generic property
access TypeErrors rather than a contextual WebDAV connection error.

## Scope

- Validate the minimal connection shape required for auth header generation.
- Preserve Basic and Bearer header output for valid connections.
- Extend focused WebDAV URL/auth helper tests.

## Validation

- `node tools/test/webdav-url-run-tests.js`
- `npm run check`
- `npm test`
