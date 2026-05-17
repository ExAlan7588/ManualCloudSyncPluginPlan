# Progress

- Started batch 17.
- Audit finding: deploy verifier accepts non-decimal `TT_SYNC_PORT` syntax because it uses `Number(value)`.
- Added failing regression coverage for `TT_SYNC_PORT=0x2500`.
- Updated deploy verifier port validation to require decimal digits before converting to a number.
- Validation passed:
  - `timeout 60s node tools/test/deploy-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
