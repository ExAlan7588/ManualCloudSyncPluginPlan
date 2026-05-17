# Batch 73 - WebDAV href input diagnostics

## Finding

`hrefFileName()` assumes the href argument is a string and calls `.trim()`
before adding WebDAV context. Direct malformed input therefore throws a generic
TypeError such as `href.trim is not a function`.

## Scope

- Preserve valid href parsing and existing decode error behavior.
- Reject non-string href input with a contextual WebDAV PROPFIND error.
- Add a focused WebDAV compat test file instead of growing the large frontend
  test.

## Validation

- `node tools/test/webdav-compat-run-tests.js`
- `npm run check`
- `npm test`
