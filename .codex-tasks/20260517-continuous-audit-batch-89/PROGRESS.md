# Progress

## 2026-05-17

- Started Batch 89.
- Audit finding: account endpoint accepts syntactically valid but unsafe or broken URLs, including non-HTTP schemes, credentials, and fragments.
- Added focused regression test. It failed before the fix because an unsafe endpoint URL was accepted.
- Added `isAccountEndpointUrl()` to allow only HTTP(S) endpoints without credentials or fragments.
- Focused validation passed: `node tools/test/tt-sync-account-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
