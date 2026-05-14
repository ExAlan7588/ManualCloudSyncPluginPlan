# Progress

## Recovery

- Task: restore smoke verifier environment after local startup failure.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-smoke-env-restore/TODO.csv`
- Current: Step 2, fix cleanup.

## Log

- 2026-05-14T22:50:00+08:00: Running `node tools/test/smoke-deploy-run-tests.js` in this sandbox failed because `startServer()` could not listen on `127.0.0.1`; the test then showed `TT_SYNC_PAIRING_TOKEN` leaked as the temporary random token instead of being restored.
- 2026-05-14T22:54:13+08:00: Fixed `createLocalRuntime()` so local startup failures restore `TT_SYNC_PAIRING_TOKEN`, remove the temp data directory, and rethrow the original startup error. Added a startup-failure regression test before the successful local-listen smoke test.
- 2026-05-14T22:54:13+08:00: Validation passed for `node --check tools/smoke-tt-sync-server.js`, `node --check tools/test/smoke-deploy-run-tests.js`, and the new first smoke-deploy test. The full smoke-deploy suite then stops at sandbox `listen EPERM`, as expected.
- 2026-05-14T22:55:40+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
