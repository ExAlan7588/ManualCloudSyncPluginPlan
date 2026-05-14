# Progress

## Recovery

- Task: fix missing `HttpError` import in route URL parser.
- Shape: single-full.
- Truth file: `.codex-tasks/20260515-route-http-error-import/TODO.csv`
- Current: Step 2, add handler-level test and fix import.

## Log

- 2026-05-15T00:01:01+08:00: Audited `server/lib/routes.js`; `parseHttpUrl()` references `HttpError` without importing it, so unsupported URL schemes can turn an intended 400 into a 500.
- 2026-05-15T00:03:48+08:00: Added `server/test/routes-unit-run-tests.js` with a handler-level account pairing URI request using `ftp://`; it failed with status 500 before the fix.
- 2026-05-15T00:03:48+08:00: Imported `HttpError` in `server/lib/routes.js`, preserving the existing `badRequest` status when `parseHttpUrl()` rejects unsupported schemes.
- 2026-05-15T00:03:48+08:00: Added the route unit test to the no-listen portion of `npm test`.
- 2026-05-15T00:03:48+08:00: Validation passed: `timeout 60s node server/test/routes-unit-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-15T00:03:48+08:00: `timeout 60s npm test` now passes no-listen tests through account unit coverage, then stops at the existing sandbox blocker `listen EPERM: operation not permitted 127.0.0.1`.
- 2026-05-15T00:03:48+08:00: File-size check: `server/lib/routes.js` 511 lines, `server/test/routes-unit-run-tests.js` 61, `package.json` 18.
- 2026-05-15T00:03:48+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
