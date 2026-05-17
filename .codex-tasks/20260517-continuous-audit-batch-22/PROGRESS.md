# Progress

- Started batch 22.
- Audit finding: storage upload size validation accepts non-decimal `sizeBytes` through `Number(value)`.
- Added failing regression coverage for buffer and streamed upload expected `sizeBytes`.
- Replaced permissive upload size comparisons with explicit non-negative integer validation.
- Validation passed:
  - `timeout 60s node server/test/storage-io-run-tests.js`
  - `timeout 60s npm run check`
  - `timeout 60s npm test`
