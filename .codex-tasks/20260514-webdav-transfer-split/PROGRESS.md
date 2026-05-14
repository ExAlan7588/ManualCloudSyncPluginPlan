# Progress

## Recovery

- Task: split WebDAV XHR transfer helpers.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-webdav-transfer-split/TODO.csv`
- Current: Step 2, extract and cover helper.

## Log

- 2026-05-14T23:48:34+08:00: `modules/webdav-compat.js` is 529 lines. The XHR transfer helper block is cohesive and can be moved without behavior changes.
- 2026-05-14T23:52:05+08:00: Added `modules/webdav-transfer.js` and moved XHR transfer setup, progress reporting, response completion, and XHR failure formatting into it.
- 2026-05-14T23:52:05+08:00: Updated `modules/webdav-compat.js` to pass the resolved URL and merged WebDAV auth/content headers into the transfer helper.
- 2026-05-14T23:52:05+08:00: Added `tools/test/webdav-transfer-run-tests.js` with fake-XHR coverage for header setup, successful resolution, progress status, and HTTP failure detail.
- 2026-05-14T23:52:05+08:00: Added the WebDAV transfer test to `npm test`.
- 2026-05-14T23:52:05+08:00: Validation passed: `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`, `timeout 60s node tools/test/webdav-transfer-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-14T23:52:05+08:00: File-size check: `modules/webdav-compat.js` 442 lines, `modules/webdav-transfer.js` 90, `tools/test/webdav-transfer-run-tests.js` 87, `package.json` 18.
- 2026-05-14T23:52:05+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
