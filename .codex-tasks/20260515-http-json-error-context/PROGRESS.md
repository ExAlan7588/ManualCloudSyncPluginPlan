# Progress

## Recovery

- Task: add JSON parser detail to API bad request errors.
- Shape: single-full.
- Truth file: `.codex-tasks/20260515-http-json-error-context/TODO.csv`
- Current: Step 2, add test and implementation.

## Log

- 2026-05-15T00:20:06+08:00: Audited `server/lib/http-helpers.js`; `readJsonRequest()` reports invalid JSON without parser location details.
- 2026-05-15T00:22:55+08:00: Added `server/test/http-helpers-run-tests.js` covering malformed JSON parser context, empty-body fallback, and body/buffer return behavior.
- 2026-05-15T00:22:55+08:00: Updated `readJsonRequest()` to include the `JSON.parse` message in the existing `badRequest` error.
- 2026-05-15T00:22:55+08:00: Added the HTTP helper test to the no-listen portion of `npm test`.
- 2026-05-15T00:22:55+08:00: Validation passed: `timeout 60s node server/test/http-helpers-run-tests.js`, `timeout 60s node server/test/routes-unit-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-15T00:22:55+08:00: `timeout 60s npm test` now passes no-listen tests through account unit coverage, then stops at the existing sandbox blocker `listen EPERM: operation not permitted 127.0.0.1` in `server/test/run-tests.js`.
- 2026-05-15T00:22:55+08:00: File-size check: `server/lib/http-helpers.js` 84 lines, `server/test/http-helpers-run-tests.js` 32, `package.json` 18.
- 2026-05-15T00:22:55+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
