# Continuous Audit Batch 124

## Scope

Audit route bundle response entry metadata and reject malformed plan entry sizes before storage IO and response serialization.

## Finding

`buildDownloadBundle()` returns each plan entry object in the bundle response. Route-level plan entry validation covers path and `modifiedMs`, but not `sizeBytes`, so corrupted plans can expose non-decimal or unsafe size metadata in bundle responses.

## Constraints

- Do not change valid bundle behavior.
- Reject only malformed plan entry `sizeBytes` values.
- Keep the fix local to route helper validation and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
