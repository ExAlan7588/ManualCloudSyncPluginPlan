# Progress

## Recovery

- Task: continuous audit batch 6
- Shape: single-full
- Progress: 4/5
- Current: commit batch and report hash
- Truth file: `.codex-tasks/20260517-continuous-audit-batch-6/TODO.csv`
- Next step: patch `isSha256()` and add focused frontend/WebDAV coverage

## Log

- Audit finding: WebDAV compatibility manifests accept uppercase SHA-256 hex
  because `isSha256()` uses `/^[a-fA-F0-9]{64}$/`. The server manifest
  contract requires lowercase 64-character hex, so compat queue validation is
  looser than the main sync path.
- Intended fix: require lowercase hex in compat manifest validation and add a
  focused test that malformed uppercase digest manifests are rejected.
- Implemented: `isSha256()` now requires lowercase hex only.
- Added focused `compatListQueue()` coverage with fake WebDAV responses and
  restored test globals.
- Validation passed so far:
  - `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
