# Progress

## Recovery

- Task: add parser detail to smoke HTTP JSON errors.
- Shape: single-full.
- Truth file: `.codex-tasks/20260515-smoke-http-json-error/TODO.csv`
- Current: Step 2, add helper test and implementation.

## Log

- 2026-05-15T00:34:17+08:00: Audited `tools/smoke-http.js`; `parseJsonResponse()` throws raw HTTP response text on malformed JSON but omits parser location details.
- 2026-05-15T00:37:28+08:00: Added `tools/test/smoke-http-run-tests.js` covering malformed JSON parser detail, server error preservation, and request headers.
- 2026-05-15T00:37:28+08:00: Updated `parseJsonResponse()` to preserve the `HTTP <status>: <body>` prefix while appending `invalid JSON: <parser detail>`.
- 2026-05-15T00:37:28+08:00: Added the smoke HTTP test to `npm test`.
- 2026-05-15T00:37:28+08:00: Validation passed: `timeout 60s node tools/test/smoke-http-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-15T00:37:28+08:00: `timeout 60s node tools/test/smoke-deploy-run-tests.js` passed env-restore and malformed-SSE checks, then hit the existing sandbox blocker `listen EPERM: operation not permitted 127.0.0.1`.
- 2026-05-15T00:37:28+08:00: `timeout 60s npm test` passes no-listen tests through account unit coverage, then stops at the existing sandbox blocker in `server/test/run-tests.js`.
- 2026-05-15T00:37:28+08:00: File-size check: `tools/smoke-http.js` 41 lines, `tools/test/smoke-http-run-tests.js` 27, `package.json` 18.
- 2026-05-15T00:37:28+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
