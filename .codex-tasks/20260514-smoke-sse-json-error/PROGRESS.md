# Progress

## Recovery

- Task: add contextual errors for malformed smoke verifier SSE progress JSON.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-smoke-sse-json-error/TODO.csv`
- Current: Step 2, add explicit error.

## Log

- 2026-05-14T23:07:43+08:00: Audited `tools/smoke-tt-sync-server.js`; `parseSseProgress()` calls `JSON.parse()` on server-provided SSE data without wrapping parse errors.
- 2026-05-14T23:11:09+08:00: Exported `parseSseProgress()` for focused tests and wrapped malformed progress JSON with `SSE progress response must include valid JSON data`. `npm run check` passed. `node tools/test/smoke-deploy-run-tests.js` passes the startup cleanup and malformed SSE tests, then stops at sandbox `listen EPERM`.
- 2026-05-14T23:11:48+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
