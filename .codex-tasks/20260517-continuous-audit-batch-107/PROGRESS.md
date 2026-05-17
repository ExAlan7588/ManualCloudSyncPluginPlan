# Progress

## 2026-05-17

- Started Batch 107.
- Audit finding: public HTTP error messages preserve control whitespace and can pollute logs or UI output.
- Added focused regression tests. They failed before the fix because `sendError()` reflected newline and tab characters.
- Added `publicErrorMessage()` and used it for JSON parser detail and HTTP error responses.
- Focused validation passed: `node server/test/http-helpers-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
