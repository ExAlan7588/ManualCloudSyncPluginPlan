# Continuous Audit Batch 26

## Scope

Audit WebDAV compat manifest size validation for malformed numeric strings.

## Finding

`modules/webdav-compat.js` rejects null and fractional `sizeBytes`, but
`isNonNegativeInteger()` still accepts string values such as `0x10` because it
uses `Number(value)` after only checking that the string is non-empty.

## Constraints

- Do not change valid WebDAV queue behavior.
- Keep number values and decimal digit strings valid.
- Reject non-decimal manifest `sizeBytes` strings at the manifest boundary.

## Validation

- `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
