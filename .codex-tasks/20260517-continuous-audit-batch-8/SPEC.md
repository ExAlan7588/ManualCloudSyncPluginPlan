# Continuous Audit Batch 8

## Objective

Continue auditing the project for bugs, security risks, exception handling
problems, race conditions, resource leaks, input validation gaps, test coverage
gaps, and maintainability issues. Apply only minimal, safe, verifiable fixes.

## Boundaries

- Do not change existing feature points.
- Do not expand requirements.
- Do not change valid ZIP/artifact scan behavior.
- Surface malformed ZIP structure explicitly.
- Commit the completed batch after validation passes.

## Batch Focus

Tighten ZIP central directory parsing diagnostics so malformed central directory
sizes fail with a specific error instead of a later generic range failure.

## Validation Gates

- `timeout 60s node tools/test/verify-tauritavern-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`

