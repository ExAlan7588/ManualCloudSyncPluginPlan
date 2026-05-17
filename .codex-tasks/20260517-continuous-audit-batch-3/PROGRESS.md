# Progress

## Recovery

- Task: continuous audit batch 3
- Shape: single-full
- Progress: 4/5
- Current: commit batch and report hash
- Truth file: `.codex-tasks/20260517-continuous-audit-batch-3/TODO.csv`
- Next step: patch `decodePath()` and add focused encoding tests

## Log

- Audit finding: `server/lib/encoding.js` decodes base64url path bytes with
  `Buffer.toString('utf8')`. Node replaces invalid UTF-8 byte sequences with
  U+FFFD, which can silently normalize malformed route path input.
- Intended fix: validate UTF-8 with a fatal `TextDecoder` before passing the
  decoded path to `validateSyncPath()`. Valid encoded paths keep the same shape
  and API behavior.
- Implemented: `decodePath()` now rejects invalid UTF-8 bytes before sync path
  validation.
- Added regression coverage for a base64url string that decodes to invalid
  UTF-8.
- Validation passed so far:
  - `timeout 60s node server/test/encoding-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
