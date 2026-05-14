# Progress

## Recovery

- Task: split evidence URL tests from `tools/test/run-tests.js`.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-evidence-test-split/TODO.csv`
- Current: Step 2, split URL consistency tests.

## Log

- 2026-05-14T23:11:48+08:00: `tools/test/run-tests.js` is 584 lines, close to the 600-line hard limit. URL/server consistency tests are a coherent group and can be moved without changing verifier behavior.
- 2026-05-14T23:15:08+08:00: Moved URL/server consistency tests into `tools/test/evidence-url-run-tests.js`; `tools/test/run-tests.js` is now 503 lines. `node tools/test/evidence-url-run-tests.js`, `node tools/test/run-tests.js`, and `npm run check` passed.
- 2026-05-14T23:15:52+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
