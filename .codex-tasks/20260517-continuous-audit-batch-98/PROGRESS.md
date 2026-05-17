# Progress

## 2026-05-17

- Started Batch 98.
- Audit finding: server timestamp display uses truthiness before validation, hiding `0` and showing malformed objects as `未回傳`.
- Added focused regression test. It failed before the fix because a zero timestamp was hidden.
- Added `serverTimestampText()` to format scalar timestamps before display decisions and suppress non-scalar values.
- Focused validation passed: `node tools/test/tt-sync-view-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
