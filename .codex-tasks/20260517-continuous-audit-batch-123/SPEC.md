# Continuous Audit Batch 123

## Scope

Audit route download response header inputs and reject malformed plan entry timestamps before storage IO and header serialization.

## Finding

`downloadPlanFile()` uses plan entry `modifiedMs` to generate `Last-Modified` and `X-TT-Sync-Modified-Ms` headers. Route-level plan entry validation checks path shape only, so a corrupted plan can pass non-decimal or unsafe timestamp data into storage/header handling.

## Constraints

- Do not change valid download or bundle behavior.
- Reject only malformed plan entry `modifiedMs` values.
- Keep the fix local to route helper validation and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
