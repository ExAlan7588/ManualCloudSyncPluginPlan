# Progress

- Started batch 18.
- Audit finding: runtime server port parsing uses `Number(value)` and accepts non-decimal syntax.
- Added failing regression coverage for `buildPairingUri({ port: '0x2500' })`.
- Added strict shared server port parsing for `startServer()` and pairing URI listener URLs.
- Validation passed:
  - `timeout 60s node server/test/tt-sync-server-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
