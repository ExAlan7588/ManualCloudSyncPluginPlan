# Batch 62 - Share WebDAV header validation

## Scope

- Audit and minimally fix the remaining WebDAV fetch header merge path.
- Do not change valid WebDAV auth headers, extra headers, request methods, or transfer behavior.

## Finding

The XHR transfer path now validates WebDAV headers, but `webDavFetch()` still merges extra headers through `Object.entries(options.headers || {})`. This leaves the same malformed-header boundary open for fetch-based WebDAV requests.

## Validation

- Focused regression: `timeout 60s node tools/test/webdav-transfer-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
