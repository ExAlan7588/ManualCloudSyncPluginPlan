# Batch 81 - WebDAV URL endpoint diagnostics

## Finding

`webDavUrlForKey()` validates the key but still passes `config.endpoint`
directly into `new URL()`. Malformed endpoint/config values surface as generic
`Invalid URL` or property access errors without WebDAV context.

## Scope

- Validate endpoint as non-empty text before URL construction.
- Wrap URL parser errors with a contextual WebDAV endpoint message.
- Preserve valid URL construction behavior.

## Validation

- `node tools/test/webdav-url-run-tests.js`
- `npm run check`
- `npm test`
