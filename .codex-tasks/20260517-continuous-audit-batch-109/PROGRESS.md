# Progress

## 2026-05-17

- Started Batch 109.
- Audit finding: progress summaries count unrelated staged entries and can inflate transferred files or bytes.
- Added focused regression test. It failed before the fix because a stale staged entry inflated `bytesTransferred` from 10 to 110.
- Added `currentStagedEntries()` to filter staged entries to current upload/download paths before computing progress.
- Focused validation passed: `node server/test/plan-response-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
