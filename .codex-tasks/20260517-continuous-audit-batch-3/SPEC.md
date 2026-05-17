# Continuous Audit Batch 3

## Objective

Continue auditing the project for bugs, security risks, exception handling
problems, race conditions, resource leaks, input validation gaps, test coverage
gaps, and maintainability issues. Apply only minimal, safe, verifiable fixes.

## Boundaries

- Do not change existing feature points.
- Do not expand requirements.
- Do not change user-visible behavior or public APIs for valid requests.
- Reject malformed inputs explicitly instead of silently normalizing them.
- Commit the completed batch after validation passes.

## Batch Focus

Tighten encoded sync path validation so invalid UTF-8 byte sequences are rejected
instead of being decoded with replacement characters.

## Validation Gates

- `timeout 60s node server/test/encoding-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`

