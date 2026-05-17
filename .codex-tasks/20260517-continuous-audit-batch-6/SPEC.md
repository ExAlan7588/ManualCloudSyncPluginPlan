# Continuous Audit Batch 6

## Objective

Continue auditing the project for bugs, security risks, exception handling
problems, race conditions, resource leaks, input validation gaps, test coverage
gaps, and maintainability issues. Apply only minimal, safe, verifiable fixes.

## Boundaries

- Do not change existing feature points.
- Do not expand requirements.
- Do not change valid WebDAV queue behavior.
- Reject malformed manifests explicitly at the boundary.
- Commit the completed batch after validation passes.

## Batch Focus

Make WebDAV compatibility manifest SHA-256 validation match the server manifest
contract by requiring lowercase 64-character hex digests.

## Validation Gates

- `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`

