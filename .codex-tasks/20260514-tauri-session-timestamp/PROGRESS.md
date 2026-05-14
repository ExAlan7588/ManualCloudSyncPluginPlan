# Progress

## Recovery

- Task: validate signed Tauri session request timestamp freshness.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-tauri-session-timestamp/TODO.csv`
- Current: Step 2, add check.

## Log

- 2026-05-14T23:22:07+08:00: Audited `server/lib/tauri-contract.js`; `TT-Timestamp-Ms` is signed but not checked against a freshness window.
- 2026-05-14T23:25:01+08:00: Added a 5-minute freshness window for signed Tauri session requests. Added `server/test/tauri-contract-unit-run-tests.js` covering current, stale, and future timestamps. Focused test and `npm run check` passed; `npm test` reaches the new test then stops at sandbox `listen EPERM`.
- 2026-05-14T23:25:44+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
