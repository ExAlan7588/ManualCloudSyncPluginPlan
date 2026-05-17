# Progress

## 2026-05-17

- Started Batch 87.
- Audit finding: account device/history list text fields can stringify malformed object or boolean values into UI rows.
- Added focused regression test. It failed before the fix because malformed device text leaked into the rendered row.
- Added display-only `itemText()` filtering for account device/history fields and timestamp fragments.
- Focused validation passed: `node tools/test/tt-sync-account-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
