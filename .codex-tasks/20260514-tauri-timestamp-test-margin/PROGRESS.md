# Progress

## Recovery

- Task: stabilize Tauri timestamp freshness unit tests.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-tauri-timestamp-test-margin/TODO.csv`
- Current: Step 2, adjust test margin.

## Log

- 2026-05-14T23:57:42+08:00: `timeout 60s npm test` failed at `testFutureSignedSessionRequestFails`; the fixture used only `SESSION_WINDOW_MS + 1` ms into the future, so elapsed test execution can make it valid by the time verification runs.
- 2026-05-14T23:59:33+08:00: Added `OUTSIDE_WINDOW_MARGIN_MS = 60 * 1000` and used it for stale/future timestamp fixtures; production freshness window remains unchanged.
- 2026-05-14T23:59:33+08:00: Validation passed: `timeout 60s node server/test/tauri-contract-unit-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-14T23:59:33+08:00: `timeout 60s npm test` now passes no-listen tests through account unit coverage, then stops at the existing sandbox blocker `listen EPERM: operation not permitted 127.0.0.1` in `server/test/run-tests.js`.
- 2026-05-14T23:59:33+08:00: File-size check: `server/test/tauri-contract-unit-run-tests.js` 76 lines, `package.json` 18.
- 2026-05-14T23:59:33+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
