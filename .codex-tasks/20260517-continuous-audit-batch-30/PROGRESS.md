# Progress

- Started batch 30.
- Audit finding: WebDAV manifest `createdAt` accepts non-ISO strings via `Date.parse(value)`.
- Added failing regression coverage for WebDAV `createdAt: '0'`.
- Added ISO datetime shape validation before parsing WebDAV manifest `createdAt`.
- Validation passed:
  - `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
