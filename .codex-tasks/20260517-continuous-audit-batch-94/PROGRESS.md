# Progress

## 2026-05-17

- Started Batch 94.
- Audit finding: server list arrays can contain null or primitive entries that are accepted and later render as empty/misleading options.
- Added focused regression test. It failed before the fix because null server entries were accepted.
- Added `validatedServerList()` and `isServerItem()` to reject malformed server entries.
- Focused validation passed: `node tools/test/tt-sync-view-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
