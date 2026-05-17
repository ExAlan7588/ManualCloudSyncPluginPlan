# Progress

## Recovery

- Task: continuous audit batch 5
- Shape: single-full
- Progress: 4/5
- Current: commit batch and report hash
- Truth file: `.codex-tasks/20260517-continuous-audit-batch-5/TODO.csv`
- Next step: patch `normalizeEndpoint()` and add focused smoke verifier coverage

## Log

- Audit finding: `tools/smoke-tt-sync-server.js` normalizes remote endpoints
  with `new URL(endpoint)` but does not restrict the protocol. Because the tool
  only performs HTTP requests, non-HTTP schemes should fail explicitly at the
  input boundary.
- Intended fix: accept only `http:` and `https:` in `normalizeEndpoint()`, with
  a focused regression test. Existing local mode and valid remote HTTP(S)
  behavior are unchanged.
- Implemented: `normalizeEndpoint()` now rejects non-HTTP(S) schemes with a
  clear CLI boundary error.
- Added regression coverage for an `ftp://` endpoint.
- Validation passed so far:
  - `timeout 60s node tools/test/smoke-deploy-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
