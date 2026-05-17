# Progress

## 2026-05-17

- Started Batch 104.
- Audit finding: malformed primary display aliases can shadow later valid aliases because validation happens after `||` selection.
- Added focused regression test. It failed before the fix because malformed primary aliases forced the label back to `server-1`.
- Added `firstServerDisplayText()` so display aliases are validated before selection.
- Focused validation passed: `node tools/test/tt-sync-view-run-tests.js`.
- Full validation first failed in `server/test/run-tests.js` with Fetch `bad port`; this exposed OS auto-port selection landing on a Fetch-blocked port.
- Added auto-port retry in `startServer()` only for `port: 0`, preserving explicit port behavior.
- Focused validation passed: `node server/test/tt-sync-server-run-tests.js` and `node server/test/run-tests.js`.
- Adjusted display alias helper to preserve existing frontend source-contract checks for `server?.base_url` and snake_case ids.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
