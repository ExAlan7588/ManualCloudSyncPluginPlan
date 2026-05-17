# Continuous Audit Batch 122

## Scope

Audit route download/bundle plan entry validation and stop malformed plan entry paths before they reach storage IO.

## Finding

Route helpers validate that plan entry containers are arrays, but `planEntries()` does not validate each entry path. Downstream storage path helpers eventually reject malformed paths, but the route contract currently passes corrupted entry objects deeper into IO code.

## Constraints

- Do not change valid download or bundle behavior.
- Reject only malformed plan entry paths.
- Keep the fix local to route helper logic and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
