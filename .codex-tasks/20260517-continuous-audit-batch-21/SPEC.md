# Continuous Audit Batch 21

## Scope

Audit Tauri plan response byte aggregation for corrupted transfer metadata.

## Finding

`server/lib/tauri-contract.js` computes `bytes_total` with
`Number(entry.sizeBytes || 0)`. That can hide malformed transfer entries by
treating missing sizes as zero or accepting non-decimal strings such as `0x10`.

## Constraints

- Do not change valid Tauri response shapes.
- Keep valid number values and decimal digit strings supported.
- Fail explicitly if internal transfer metadata is malformed.

## Validation

- `timeout 60s node server/test/tauri-contract-unit-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
