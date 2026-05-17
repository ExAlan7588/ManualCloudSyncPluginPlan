# Progress

- Started batch 26.
- Audit finding: WebDAV manifest `sizeBytes` accepts non-decimal strings through `Number(value)`.
- Added failing regression coverage for WebDAV `sizeBytes: '0x10'`.
- Tightened WebDAV manifest size validation so string values must be decimal digits.
- Validation passed:
  - `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
