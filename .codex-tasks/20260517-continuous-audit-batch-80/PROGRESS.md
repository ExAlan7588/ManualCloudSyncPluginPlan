# Progress

## 2026-05-17

- Started Batch 80 after auditing WebDAV auth header value construction.
- Finding: malformed credential values can be stringified into Authorization
  headers.
- Added focused malformed Basic/Bearer credential tests; before implementation
  missing Basic password is accepted and stringified.
- Added `requiredAuthText()` so Basic username/password and Bearer token must be
  non-empty strings before header construction.
- Focused test now passes.
- Validation passed: `node tools/test/webdav-url-run-tests.js`,
  `npm run check`, `npm test`, and `git diff --check`.
