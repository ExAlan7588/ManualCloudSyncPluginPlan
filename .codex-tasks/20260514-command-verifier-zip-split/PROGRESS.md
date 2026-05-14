# Progress

## Recovery

- Task: extract ZIP parser from command verifier.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-command-verifier-zip-split/TODO.csv`
- Current: Step 2, extract helper.

## Log

- 2026-05-14T23:15:52+08:00: `tools/verify-tauritavern-tt-sync.js` is 586 lines, close to the 600-line hard limit. The ZIP parser is isolated and covered by existing verifier tests.
- 2026-05-14T23:20:03+08:00: Extracted ZIP parsing into `tools/zip-entries.js`; `tools/verify-tauritavern-tt-sync.js` is now 424 lines. `node tools/test/verify-tauritavern-run-tests.js` and `npm run check` passed.
- 2026-05-14T23:20:51+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
