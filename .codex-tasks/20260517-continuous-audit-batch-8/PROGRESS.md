# Progress

## Recovery

- Task: continuous audit batch 8
- Shape: single-full
- Progress: 4/5
- Current: commit batch and report hash
- Truth file: `.codex-tasks/20260517-continuous-audit-batch-8/TODO.csv`
- Next step: patch `tools/zip-entries.js` and add verifier coverage

## Log

- Audit finding: `tools/zip-entries.js` walks central directory entries until
  `cursor < endOffset`, but never checks that the final cursor exactly matches
  the EOCD central directory end. A malformed size can fail later with a generic
  ZIP range error.
- Intended fix: assert the cursor equals the EOCD-declared central directory end
  after reading entries, preserving behavior for valid ZIPs while improving
  corrupt ZIP diagnostics.
- Implemented: central directory parsing now throws
  `Invalid ZIP central directory size` when entry headers do not exactly match
  the EOCD-declared central directory size.
- Added focused verifier coverage by corrupting the EOCD central directory size
  of an otherwise valid APK fixture.
- Validation passed so far:
  - `timeout 60s node tools/test/verify-tauritavern-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
