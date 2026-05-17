# Continuous Audit Batch 4

## Objective

Continue auditing the project for bugs, security risks, exception handling
problems, race conditions, resource leaks, input validation gaps, test coverage
gaps, and maintainability issues. Apply only minimal, safe, verifiable fixes.

## Boundaries

- Do not change existing feature points.
- Do not expand requirements.
- Do not change valid request behavior or public APIs.
- Keep oversized body failures explicit.
- Commit the completed batch after validation passes.

## Batch Focus

Harden HTTP JSON body reading after the request size limit is exceeded so late
stream events cannot race the first explicit failure, and add focused coverage
for oversized JSON bodies.

## Validation Gates

- `timeout 60s node server/test/http-helpers-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`

