# Progress

## 2026-05-17

- Started Batch 108.
- Audit finding: progress SSE error events still serialize raw control whitespace in error messages.
- Added focused regression test. It failed before the fix because SSE error payload preserved `\n\t` as escaped control whitespace.
- Exported `publicErrorMessage()` and reused it for progress SSE error events.
- Focused validation passed: `node server/test/progress-events-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
