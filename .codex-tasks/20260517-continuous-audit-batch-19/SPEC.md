# Continuous Audit Batch 19

## Scope

Audit server manifest numeric input validation for malformed numeric strings.

## Finding

Generic manifest and Tauri manifest normalization reject null numeric fields, but
their shared pattern still accepts string values such as `0x10` and `1e3`
because they are converted with `Number(value)`.

## Constraints

- Do not change valid manifest shape or API response shape.
- Keep number values and decimal digit strings valid.
- Reject non-decimal numeric strings explicitly at the manifest boundary.

## Validation

- `timeout 60s node server/test/manifest-run-tests.js`
- `timeout 60s node server/test/tauri-contract-unit-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
