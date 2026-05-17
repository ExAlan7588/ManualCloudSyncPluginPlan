# Continuous Audit Batch 29

## Scope

Audit final evidence timestamp validation.

## Finding

The evidence verifier accepts timestamps with `Date.parse(value)`. Node accepts
non-ISO strings such as `0` and `1` as dates, allowing malformed evidence
timestamps to pass.

## Constraints

- Do not change valid ISO timestamp evidence.
- Require datetime strings with `T` and an explicit `Z` or timezone offset.
- Keep failures explicit in the existing check report.

## Validation

- `timeout 60s node tools/test/run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
