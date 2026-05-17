# Batch 61 - Validate WebDAV transfer headers

## Scope

- Audit and minimally fix WebDAV XHR transfer header shape validation.
- Do not change valid WebDAV transfer behavior, progress reporting, or HTTP failure handling.

## Finding

`setXhrHeaders()` iterates `Object.entries(headers || {})`. Non-object headers such as strings or arrays can therefore be accepted into the XHR header setup path and produce unclear request errors instead of exposing invalid caller input.

## Validation

- Focused regression: `timeout 60s node tools/test/webdav-transfer-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
