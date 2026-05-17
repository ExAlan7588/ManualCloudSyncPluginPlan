# Progress

## 2026-05-17

- Started Batch 100.
- Audit finding: regressing byte counters can overwrite the last progress snapshot and inflate later speed calculations.
- Added focused regression test. It failed before the fix because a regressing event inflated the next speed to `2.0 KB/s`.
- Replaced last-snapshot storage guard with `canStoreSnapshot()` to require valid non-regressing byte counters.
- Focused validation passed: `node tools/test/tt-sync-progress-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
