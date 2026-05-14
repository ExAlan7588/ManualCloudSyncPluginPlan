# Progress

## Recovery

- Task: serialize storage plan commits.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-storage-commit-lock/TODO.csv`
- Current: Step 1, reproduce stale concurrent commit risk.

## Log

- 2026-05-14: Audited `server/lib/storage.js`; `stageFile()` and `stageFileStream()` use `withPlanLock()`, but `commitPlan()` reads and mutates the supplied plan snapshot without locking or re-reading the latest plan.
- 2026-05-14T23:03:21+08:00: Added storage-level regression coverage with two independently read stale snapshots. The test failed before the fix because both commits could succeed.
- 2026-05-14T23:03:21+08:00: Updated `commitPlan()` to use `withPlanLock()`, re-read the latest plan inside the lock, reject already committed plans, and return a new committed plan object. `node server/test/storage-run-tests.js` and `npm run check` passed. `npm test` reaches progress/storage tests then remains blocked by sandbox `listen EPERM`.
- 2026-05-14T23:04:21+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
