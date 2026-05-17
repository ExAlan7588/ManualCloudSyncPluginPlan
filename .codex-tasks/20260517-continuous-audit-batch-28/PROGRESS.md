# Progress

- Started batch 28.
- Audit finding: `formatProgress()` accepts malformed percent values through `Number(value)`.
- Added failing regression coverage for boolean and hex progress percent values.
- Tightened progress percent parsing to finite numbers and decimal strings.
- Validation passed:
  - `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
