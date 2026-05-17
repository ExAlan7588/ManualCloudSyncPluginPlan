# Continuous Audit Batch 11

## Scope

Audit manifest numeric input validation in the minimal TT-Sync server and Tauri v2 request adapter.

## Constraints

- Do not change accepted valid numeric manifest values.
- Do not change API response shapes.
- Reject malformed numeric inputs explicitly instead of allowing JavaScript coercion to turn them into zero.

## Finding

`server/lib/manifest.js` and `server/lib/tauri-contract.js` validate numeric fields with `Number(value)`. JavaScript converts `null`, empty strings, and booleans to `0` or `1`, so malformed manifest fields can pass the existing non-negative safe integer checks. The project documentation already states `sizeBytes` and `modifiedMs` must be non-negative safe integers, so type-like coercions should be rejected.

## Acceptance

- General manifest validation rejects null numeric fields.
- Tauri manifest validation rejects null numeric fields.
- Existing valid numeric values remain accepted.
- Full syntax and test validation pass under a 60 second timeout.
