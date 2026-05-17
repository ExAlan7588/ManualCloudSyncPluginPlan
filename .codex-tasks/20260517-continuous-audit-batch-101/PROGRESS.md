# Progress

## 2026-05-17

- Started Batch 101.
- Audit finding: server list entries can be objects without a stable scalar id, allowing empty or unstable option values to reach later commands.
- Added focused regression test. It failed before the fix because malformed server ids were accepted.
- Added shared `serverIdText()` validation and required a non-empty scalar id for server list entries.
- Focused validation passed: `node tools/test/tt-sync-view-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
