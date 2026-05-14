# Progress

## Recovery

- Task: split smoke HTTP helpers out of the near-limit smoke verifier.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-smoke-http-helper-split/TODO.csv`
- Current: Step 2, extract helpers.

## Log

- 2026-05-14T23:46:02+08:00: `tools/smoke-tt-sync-server.js` is 554 lines. The HTTP/SSE helper block is self-contained enough to split without behavior changes.
- 2026-05-14T23:47:20+08:00: Added `tools/smoke-http.js` for response parsing, request headers, raw response error formatting, and SSE progress parsing.
- 2026-05-14T23:47:20+08:00: `tools/smoke-tt-sync-server.js` now imports the helpers and re-exports `parseSseProgress` for existing tests.
- 2026-05-14T23:47:20+08:00: Validation passed: `timeout 60s node tools/test/deploy-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-14T23:47:20+08:00: `timeout 60s node tools/test/smoke-deploy-run-tests.js` passed env-restore and malformed-SSE checks, then hit the existing sandbox blocker `listen EPERM: operation not permitted 127.0.0.1`.
- 2026-05-14T23:47:20+08:00: File-size check: `tools/smoke-tt-sync-server.js` 525 lines, `tools/smoke-http.js` 41, `tools/test/smoke-deploy-run-tests.js` 150, `package.json` 18.
- 2026-05-14T23:47:20+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
