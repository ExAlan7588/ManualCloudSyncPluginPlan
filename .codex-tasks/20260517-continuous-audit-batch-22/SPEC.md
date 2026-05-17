# Continuous Audit Batch 22

## Scope

Audit storage upload size validation for malformed manifest metadata.

## Finding

`validateStagedBuffer()` and streamed upload completion compare actual bytes with
`Number(sizeBytes)`. If a polluted plan entry contains `sizeBytes: "0x10"`, a
16-byte upload is accepted as matching the manifest.

## Constraints

- Do not change upload APIs or valid upload behavior.
- Keep number values and decimal digit strings valid.
- Reject malformed expected byte metadata explicitly.

## Validation

- `timeout 60s node server/test/storage-io-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
