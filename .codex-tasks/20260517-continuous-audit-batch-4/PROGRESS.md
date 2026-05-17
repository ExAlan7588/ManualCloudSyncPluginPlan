# Progress

## Recovery

- Task: continuous audit batch 4
- Shape: single-full
- Progress: 4/5
- Current: commit batch and report hash
- Truth file: `.codex-tasks/20260517-continuous-audit-batch-4/TODO.csv`
- Next step: patch `readRawBody()` and add focused HTTP helper tests

## Log

- Audit finding: `server/lib/http-helpers.js` rejects and destroys the request
  when body size exceeds `TT_SYNC_MAX_BODY_BYTES`, but does not guard later
  `end` or `error` stream events. Native promises ignore later settlement, but
  the implementation leaves the failure path less explicit and uncovered.
- Intended fix: add a small settled guard so only the first terminal path acts,
  then test oversized body rejection with a temporary env override.
- Implemented: `readRawBody()` now ignores late `data`, `end`, and `error`
  events after an explicit resolve or reject.
- Added regression coverage for `TT_SYNC_MAX_BODY_BYTES`.
- Validation passed so far:
  - `timeout 60s node server/test/http-helpers-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
