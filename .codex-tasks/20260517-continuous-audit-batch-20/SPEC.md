# Continuous Audit Batch 20

## Scope

Audit plan response byte aggregation for corrupted plan metadata handling.

## Finding

`server/lib/plan-response.js` aggregates bytes with `Number(entry.sizeBytes || 0)`.
That silently treats missing `sizeBytes` as zero and accepts non-decimal strings
such as `0x10`, allowing polluted plan or staged metadata to be hidden in
progress and summary responses.

## Constraints

- Do not change valid plan response shapes.
- Keep valid number values and decimal digit strings supported.
- Fail explicitly when internal plan byte metadata is malformed.

## Validation

- `timeout 60s node server/test/plan-response-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
