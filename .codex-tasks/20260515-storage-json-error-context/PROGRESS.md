# Progress

## Recovery

- Task: add storage JSON parse error context.
- Shape: single-full.
- Truth file: `.codex-tasks/20260515-storage-json-error-context/TODO.csv`
- Current: Step 2, implement and test contextual read errors.

## Log

- 2026-05-15T00:50:30+08:00: Audited `server/lib/storage-io.js`; `readJson()` rethrows raw `SyntaxError` for malformed persisted state and does not identify the damaged file.
- 2026-05-15T00:51:24+08:00: Added contextual `Storage JSON is invalid: <path>: <parser detail>` error for malformed persisted JSON.
- 2026-05-15T00:51:24+08:00: Added focused storage I/O coverage for malformed JSON context and preserved atomic-write cleanup coverage.
- 2026-05-15T00:51:24+08:00: Validation passed: `timeout 60s node server/test/storage-io-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-15T00:51:24+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
