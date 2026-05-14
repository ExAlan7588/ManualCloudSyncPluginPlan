# Progress

## Recovery

- Task: split route response/request helpers from `server/lib/routes.js`.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-route-response-helper-split/TODO.csv`
- Current: Step 2, extract helpers.

## Log

- 2026-05-14T22:47:09+08:00: `server/lib/routes.js` is 579 lines after the SSE fix, close to the 600-line hard limit. Generic CORS, JSON, raw-body, and SSE helpers are only used by routes and can be extracted without changing behavior.
- 2026-05-14T22:54:13+08:00: Extracted `server/lib/http-helpers.js` for JSON body parsing, raw body size enforcement, CORS responses, JSON responses, and SSE event formatting. `server/lib/routes.js` is now 511 lines.
- 2026-05-14T22:54:13+08:00: Validation passed for `npm run check`, `node server/test/progress-events-run-tests.js`, frontend TT-Sync tests, and Tauri command verifier tests.
- 2026-05-14T22:55:40+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
