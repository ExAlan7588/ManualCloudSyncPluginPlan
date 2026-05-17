# Progress

## 2026-05-17

- Started Batch 81 after auditing WebDAV URL endpoint handling.
- Finding: malformed endpoint values produce generic URL/property errors.
- Added focused missing/invalid endpoint tests; before implementation missing
  endpoint throws generic `Invalid URL`.
- Added `webDavEndpointUrl()` to validate and parse endpoints with contextual
  WebDAV errors.
- Focused test now passes.
- Validation passed: `node tools/test/webdav-url-run-tests.js`,
  `npm run check`, `npm test`, and `git diff --check`.
