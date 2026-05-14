# Progress

## Recovery

- Task: split storage record helper functions.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-storage-record-helper-split/TODO.csv`
- Current: Step 2, extract helpers.

## Log

- 2026-05-14T23:53:35+08:00: `server/lib/storage.js` is 538 lines. Device/history/rollback response helpers are pure enough to move out of the storage class module.
- 2026-05-14T23:56:27+08:00: Added `server/lib/storage-records.js` and moved device mutation, affected path, rollback summary, history entry, capped list, pairing response, and conflict flag stripping helpers.
- 2026-05-14T23:56:27+08:00: Kept namespace `serverId` generation as UUID while extracting helpers.
- 2026-05-14T23:56:27+08:00: Added `server/test/storage-records-run-tests.js` for moved helper response shapes and device record mutation behavior.
- 2026-05-14T23:56:27+08:00: Added the storage-records test to the no-listen portion of `npm test`.
- 2026-05-14T23:56:27+08:00: Validation passed: `timeout 60s node server/test/storage-records-run-tests.js`, `timeout 60s node server/test/storage-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-14T23:56:27+08:00: File-size check: `server/lib/storage.js` 463 lines, `server/lib/storage-records.js` 87, `server/test/storage-records-run-tests.js` 75, `package.json` 18.
- 2026-05-14T23:56:27+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
