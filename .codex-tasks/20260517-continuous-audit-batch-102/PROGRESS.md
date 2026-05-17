# Progress

## 2026-05-17

- Started Batch 102.
- Audit finding: `firstObject()` accepts arrays, so malformed summary arrays can shadow valid outer conflict counts.
- Added focused regression test. It failed before the fix because an array summary changed the empty conflict message to `尚無衝突`.
- Changed `firstObject()` to reuse record-object validation so arrays no longer qualify as object payload candidates.
- Focused validation passed: `node tools/test/tt-sync-view-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
