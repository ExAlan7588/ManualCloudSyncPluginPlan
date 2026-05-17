# Batch 113 - Direct Pair Complete Endpoint Validation

## Scope

Audit direct `endpoint` validation in `/v2/pair/complete`.

## Constraints

- Do not change valid pairing requests.
- Do not alter pairing response shape.
- Reuse the same endpoint validation applied to account pairing and pairing URI endpoints.

## Finding

`normalizePairingBody()` forwards direct body `endpoint` values without URL validation. Unsafe endpoint strings can therefore reach storage when callers do not use `pairingUri`.

## Validation

- `node server/test/routes-unit-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
