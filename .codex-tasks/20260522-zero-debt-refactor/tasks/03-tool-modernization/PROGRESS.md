# Tool Modernization Progress

## Recovery

- Task: tool verifier modernization.
- Shape: single-full.
- Progress: 3/5 complete.
- Current: modernize evidence and smoke verifiers.
- Files: `.codex-tasks/20260522-zero-debt-refactor/tasks/03-tool-modernization/TODO.csv`.
- Next: inspect evidence and smoke verifiers and extract behavior-preserving helpers.

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

### 2026-05-22 00:52 Asia/Taipei

- Extracted shared source traversal helpers into `tools/source-scan.js`.
- Removed duplicated source info, realpath visited tracking, sorted directory traversal, display path, text compare, and regex escaping from the Tauri command and event verifiers.
- Kept command evidence trust logic and event surface field logic in their domain-specific verifier files.
- Reduced:
  - `tools/verify-tauritavern-tt-sync.js`: 408 to 364 lines
  - `tools/verify-tauritavern-tt-sync-events.js`: 307 to 269 lines
- Validated with:
  - `timeout 60 node tools/test/verify-tauritavern-run-tests.js`
  - `timeout 60 node tools/test/verify-tauritavern-events-run-tests.js`
  - `timeout 60 npm run check`
  - `timeout 60 npm test`
