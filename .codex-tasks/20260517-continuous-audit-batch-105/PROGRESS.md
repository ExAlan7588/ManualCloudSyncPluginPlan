# Progress

## 2026-05-17

- Started Batch 105.
- Audit finding: account pairing endpoint validation allows URL credentials and fragments.
- Added focused regression test. It failed before the fix because unsafe endpoints reached storage and returned 500.
- Added URL credential and fragment rejection to `parseHttpUrl()`.
- Focused validation passed: `node server/test/routes-unit-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
