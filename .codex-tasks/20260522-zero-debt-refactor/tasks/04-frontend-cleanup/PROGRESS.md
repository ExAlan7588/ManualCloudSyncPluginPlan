# Frontend Cleanup Progress

## Recovery

- Task: frontend module consistency cleanup.
- Shape: single-full.
- Progress: 2/5 complete.
- Current: clean TT-Sync module state and event surfaces.
- Files: `.codex-tasks/20260522-zero-debt-refactor/tasks/04-frontend-cleanup/TODO.csv`.
- Next: inspect TT-Sync transfer state and event listener boundaries.

## Log

### 2026-05-22 01:14 Asia/Taipei

- Started frontend module consistency cleanup.
- Created task tracking files for recovery.
- Initial targets are frontend modules under `modules/` and focused tests under `tools/test/`.

### 2026-05-22 01:15 Asia/Taipei

- Audited frontend module boundaries and found repeated JSON response parsing plus payload scalar/integer helpers in:
  - `modules/data-migration.js`
  - `modules/tt-sync-account.js`
  - `modules/tt-sync-progress.js`
  - `modules/tt-sync-view.js`
  - `modules/queue-renderer.js`
- Added `modules/payload.js` for shared payload shape helpers.
- Added `readJsonResponse` to `modules/errors.js` and reused it in data migration and account requests.
- Preserved explicit parse failures and existing error message context.
- Fixed a regression exposed by focused tests where `last_sync_ms: 0` must still render the epoch timestamp.
- Validation passed:
  - `timeout 60 npm run check`
  - `timeout 60 node tools/test/data-migration-run-tests.js`
  - `timeout 60 node tools/test/tt-sync-account-run-tests.js`
  - `timeout 60 node tools/test/tt-sync-progress-run-tests.js`
  - `timeout 60 node tools/test/tt-sync-view-run-tests.js`
  - `timeout 60 node tools/test/queue-renderer-run-tests.js`
  - `timeout 60 node tools/test/frontend-tt-sync-run-tests.js`
  - `timeout 60 node tools/test/config-run-tests.js`
  - `timeout 60 node tools/test/webdav-compat-run-tests.js`
