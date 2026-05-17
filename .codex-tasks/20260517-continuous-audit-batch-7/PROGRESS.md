# Progress

## Recovery

- Task: continuous audit batch 7
- Shape: single-full
- Progress: 4/5
- Current: commit batch and report hash
- Truth file: `.codex-tasks/20260517-continuous-audit-batch-7/TODO.csv`
- Next step: patch `optionalSha256()` and add a focused manifest test

## Log

- Audit finding: `server/lib/manifest.js` lowercases `sha256` before
  validation. That accepts uppercase digest input even though the error message
  and manifest contract require a lowercase 64-character hex digest.
- Intended fix: trim without lowercasing, then validate. Valid lowercase
  digests remain accepted; malformed uppercase digests fail explicitly.
- Implemented: `optionalSha256()` now trims but does not lowercase before
  validation.
- Added focused `server/test/manifest-run-tests.js` coverage and included it
  in `npm test`.
- Validation passed so far:
  - `timeout 60s node server/test/manifest-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
