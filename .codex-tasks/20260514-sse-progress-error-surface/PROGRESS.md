# Progress

## Recovery

- Task: surface TT-Sync progress SSE polling errors explicitly.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-sse-progress-error-surface/TODO.csv`
- Current: Step 1, confirm SSE failure mode.

## Log

- 2026-05-14: Audited `server/lib/routes.js`; `streamProgressEvents()` uses an async `setInterval` callback without catching `writeProgressEvent()` failures. If plan reads fail after the initial event, the rejection is not converted to an HTTP/SSE error and the connection can hang.
- 2026-05-14T22:45:33+08:00: Implemented explicit SSE `error` event output for failed progress polling and closes the stream. Added `server/test/progress-events-run-tests.js`, a handler-level regression test that does not bind a local socket.
- 2026-05-14T22:45:33+08:00: Validation passed for `node server/test/progress-events-run-tests.js` and `npm run check`. `npm test` now runs the new test first, then remains blocked by sandbox `listen EPERM` in `server/test/run-tests.js`.
- 2026-05-14T22:47:09+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
