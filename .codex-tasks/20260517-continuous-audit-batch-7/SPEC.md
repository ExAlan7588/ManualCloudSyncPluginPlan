# Continuous Audit Batch 7

## Objective

Continue auditing the project for bugs, security risks, exception handling
problems, race conditions, resource leaks, input validation gaps, test coverage
gaps, and maintainability issues. Apply only minimal, safe, verifiable fixes.

## Boundaries

- Do not change existing feature points.
- Do not expand requirements.
- Do not change valid manifest behavior.
- Reject malformed manifest input explicitly instead of normalizing it.
- Commit the completed batch after validation passes.

## Batch Focus

Make server manifest SHA-256 validation enforce the documented lowercase digest
contract instead of silently lowercasing uppercase input.

## Validation Gates

- `timeout 60s node server/test/manifest-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`

