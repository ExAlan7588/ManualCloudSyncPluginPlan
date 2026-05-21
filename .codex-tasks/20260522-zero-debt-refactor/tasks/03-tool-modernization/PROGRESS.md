# Tool Modernization Progress

## Recovery

- Task: tool verifier modernization.
- Shape: single-full.
- Progress: 2/5 complete.
- Current: modernize command and event scanners.
- Files: `.codex-tasks/20260522-zero-debt-refactor/tasks/03-tool-modernization/TODO.csv`.
- Next: inspect command/event scanner traversal and extract behavior-preserving shared helpers.

## Log

### 2026-05-22 00:45 Asia/Taipei

- Extracted shared CLI/report utilities into `tools/cli-helpers.js`.
- Removed repeated JSON manifest writing, JSON text formatting, formatted output, and CLI entry detection from verifier/smoke/template tools.
- Updated evidence tests to use the shared JSON writer directly.
- Validated with:
  - `timeout 60 npm run check`
  - `timeout 60 node tools/test/deploy-run-tests.js`
  - `timeout 60 node tools/test/verify-tauritavern-run-tests.js`
  - `timeout 60 node tools/test/verify-tauritavern-events-run-tests.js`
  - `timeout 60 node tools/test/smoke-deploy-run-tests.js`
  - `timeout 60 node tools/test/device-evidence-run-tests.js`
  - `timeout 60 node tools/test/evidence-url-run-tests.js`
  - `timeout 60 node tools/test/run-tests.js`
  - `timeout 60 npm test`
